from __future__ import annotations

import csv
import io
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, Response
from openpyxl import Workbook, load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.rbac import can
from app.db.session import get_db
from app.deps import current_user, require
from app.api.filters import qfilters
from app.models import (
    AccountingPeriod,
    AuditLog,
    Camp,
    Document,
    Employee,
    Expense,
    Invoice,
    Organization,
    SalaryRecord,
    User,
)
from app.schemas import OpeningBalanceIn
from app.services.finance import Filters, camps_with_pnl, cashflow, pnl
from app.services.ledger import post_transaction
from app.services.pdf import invoice_pdf

router = APIRouter(tags=["ops"])


def _safe_name(name: str | None) -> str:
    base = Path(name or "file").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base)[:80]
    return cleaned or "file"


@router.get("/invoices/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    inv = db.scalar(
        select(Invoice).where(Invoice.id == invoice_id).options(joinedload(Invoice.items), joinedload(Invoice.client))
    )
    if not inv or inv.org_id != user.org_id:
        raise HTTPException(404, "Invoice not found.")
    org = db.get(Organization, user.org_id)
    data = invoice_pdf(org, inv)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{inv.number}.pdf"'},
    )


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: str, db: Session = Depends(get_db), user: User = Depends(require("view_ops_detail"))):
    doc = db.get(Document, doc_id)
    if not doc or doc.org_id != user.org_id:
        raise HTTPException(404, "Document not found.")
    root = settings.storage_path.resolve()
    path = (root / Path(doc.stored_name).name).resolve()
    if not path.is_relative_to(root):
        raise HTTPException(400, "Invalid document path.")
    if not path.exists():
        raise HTTPException(404, "File is missing from storage. Re-upload the document.")
    return FileResponse(path, media_type=doc.content_type, filename=_safe_name(doc.filename))


def _csv_response(filename: str, headers: list[str], rows: list[list]):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    w.writerows(rows)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _xlsx_response(filename: str, headers: list[str], rows: list[list]):
    wb = Workbook()
    ws = wb.active
    ws.title = "Export"
    ws.append(headers)
    for row in rows:
        ws.append(row)
    out = io.BytesIO()
    wb.save(out)
    return Response(
        content=out.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/opening-balances")
def create_opening_balance(
    body: OpeningBalanceIn,
    db: Session = Depends(get_db),
    user: User = Depends(require("approve")),
):
    """Manual opening cash/bank balance with note and audit trail."""
    code = body.account_code.strip()
    if code not in {"1000", "1010"}:
        raise HTTPException(400, "Opening balance account must be 1000 (Cash) or 1010 (Bank).")
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be positive.")
    txn = post_transaction(
        db,
        org_id=user.org_id,
        user_id=user.id,
        txn_date=body.entry_date,
        txn_type="payment_in",
        amount=body.amount,
        account_code=code,
        contra_code="3000",
        description=body.note or f"Opening balance · {code}",
        reference=body.reference,
        payment_status="paid",
        payment_method="opening",
        category="opening_balance",
        dimensions={"source": "opening_balance"},
    )
    db.add(
        AuditLog(
            org_id=user.org_id,
            user_id=user.id,
            action="opening_balance.create",
            entity_type="transaction",
            entity_id=txn.id,
            after=f"{code}={float(body.amount)}",
            reason=body.note,
        )
    )
    db.commit()
    return {"id": txn.id, "account_code": code, "amount": float(body.amount), "date": body.entry_date.isoformat()}


@router.get("/export/{module}")
def export_module(
    module: str,
    fmt: str = "csv",
    db: Session = Depends(get_db),
    user: User = Depends(require("export")),
    f: Filters = Depends(qfilters),
):
    if not can(user.role, "view_ops_detail") and module in {"expenses", "employees"}:
        raise HTTPException(403, "Investor role cannot export operational ledgers.")
    org = user.org_id
    period = f"{f.date_from or ''} to {f.date_to or 'latest'}"
    meta = [["Currency", "INR"], ["Period", period], ["Generated for org", org]]
    if module == "expenses":
        headers = ["date", "number", "category", "amount", "tax", "status", "camp_id", "description"]
        q = select(Expense).where(Expense.org_id == org)
        if f.date_from:
            q = q.where(Expense.expense_date >= f.date_from)
        if f.date_to:
            q = q.where(Expense.expense_date <= f.date_to)
        if f.camp_id:
            q = q.where(Expense.camp_id == f.camp_id)
        if f.city_id:
            q = q.where(Expense.city_id == f.city_id)
        if f.client_id:
            q = q.where(Expense.client_id == f.client_id)
        items = db.scalars(q.order_by(Expense.expense_date.desc())).all()
        rows = [[e.expense_date.isoformat(), e.expense_number, e.category, float(e.amount), float(e.tax_amount), e.approval_status, e.camp_id or "", e.description or ""] for e in items]
        total = sum(float(e.amount) for e in items)
        rows.append(["TOTAL", "", "", total, "", "", "", ""])
    elif module == "invoices":
        headers = ["number", "date", "due", "total", "paid", "status", "client_id"]
        q = select(Invoice).where(Invoice.org_id == org)
        if f.date_from:
            q = q.where(Invoice.invoice_date >= f.date_from)
        if f.date_to:
            q = q.where(Invoice.invoice_date <= f.date_to)
        if f.client_id:
            q = q.where(Invoice.client_id == f.client_id)
        if f.camp_id:
            q = q.where(Invoice.camp_id == f.camp_id)
        items = db.scalars(q.order_by(Invoice.invoice_date.desc())).all()
        rows = [[i.number, i.invoice_date.isoformat(), i.due_date.isoformat(), float(i.total), float(i.amount_paid), i.status, i.client_id] for i in items]
        rows.append(["TOTAL", "", "", sum(float(i.total) for i in items), sum(float(i.amount_paid) for i in items), "", ""])
    elif module == "camps":
        camps = db.scalars(select(Camp).where(Camp.org_id == org)).all()
        headers = ["camp", "date", "channel", "revenue", "cost", "profit", "margin", "roi", "status", "flags"]
        rows = [
            [r["name"], r["date"], r["channel"], r["revenue"], r["total_cost"], r["net_profit"], r["margin"], r["roi"], r["status"], ",".join(r.get("flags") or [])]
            for r in camps_with_pnl(db, list(camps))
        ]
    elif module == "pnl":
        data = pnl(db, f)
        headers = ["line", "amount"]
        rows = [
            ["Total revenue", data["total_revenue"]],
            ["Direct costs", data["total_cogs"]],
            ["Gross profit", data["gross_profit"]],
            ["Gross margin %", data["gross_margin"]],
            ["Operating expenses", data["total_opex"]],
            ["EBITDA", data["ebitda"]],
            ["Depreciation", data["depreciation"]],
            ["Interest", data["interest"]],
            ["Tax", data["taxes"]],
            ["Net profit", data["net_profit"]],
        ]
        for line in data.get("revenue_lines") or []:
            rows.insert(1, [f"Revenue · {line.get('label') or line.get('key')}", line.get("amount")])
    elif module == "cashflow":
        data = cashflow(db, f)
        headers = ["line", "amount"]
        rows = [
            ["Opening cash", data["opening_cash"]],
            ["Customer collections", data["breakdown"]["customer_collections"]],
            ["Other inflows", data["breakdown"]["other_inflows"]],
            ["Total inflows", data["cash_inflows"]],
            ["Supplier payments", data["breakdown"]["supplier_payments"]],
            ["Employee payments", data["breakdown"]["employee_payments"]],
            ["Other outflows", data["breakdown"]["other_outflows"]],
            ["Total outflows", data["cash_outflows"]],
            ["Closing cash", data["closing_cash"]],
            ["Receivables (not cash)", data["receivables"]],
            ["Payables (not cash)", data["payables"]],
            ["Reconciliation", data["reconciliation"]["formula"]],
        ]
        for m in data.get("monthly") or []:
            rows.append([f"Month {m['month']} net", m["net"]])
    else:
        raise HTTPException(400, "Unknown export. Use expenses, invoices, camps, pnl, or cashflow.")
    # Prepend meta as comment-style first rows for CSV readability
    if fmt == "xlsx":
        return _xlsx_response(f"{module}.xlsx", headers, meta + [headers] + rows if False else rows)
    # CSV with meta header block
    buf = io.StringIO()
    w = csv.writer(buf)
    for m in meta:
        w.writerow(m)
    w.writerow([])
    w.writerow(headers)
    for row in rows:
        w.writerow(row)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{module}.csv"'},
    )


@router.post("/import/expenses-xlsx")
async def import_expenses_xlsx(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(require("create"))):
    raw = await file.read()
    try:
        wb = load_workbook(io.BytesIO(raw), data_only=True)
    except Exception:
        raise HTTPException(400, "Could not read that Excel file. Export as .xlsx with a header row.")
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(400, "The spreadsheet is empty.")
    header = [str(h).strip().lower() if h is not None else "" for h in rows[0]]
    required = {"date", "amount", "category"}
    if not required.issubset(set(header)):
        raise HTTPException(400, "Excel must include date, amount, and category columns.")
    created, errors = 0, []
    from sqlalchemy import func
    n = db.scalar(select(func.count()).select_from(Expense).where(Expense.org_id == user.org_id)) or 0
    for i, row in enumerate(rows[1:], start=2):
        mapped = {header[j]: row[j] if j < len(row) else None for j in range(len(header))}
        try:
            amt = Decimal(str(mapped["amount"]).replace(",", ""))
            raw_date = mapped["date"]
            if hasattr(raw_date, "date"):
                dt = raw_date.date() if not isinstance(raw_date, date) else raw_date
            else:
                dt = date.fromisoformat(str(raw_date)[:10])
        except Exception:
            errors.append({"row": i, "error": "Invalid date or amount."})
            continue
        n += 1
        db.add(Expense(
            org_id=user.org_id,
            expense_number=f"EXP-{int(n):04d}",
            expense_date=dt,
            amount=amt,
            category=str(mapped.get("category") or "miscellaneous"),
            cost_nature=str(mapped.get("nature") or "indirect"),
            description=str(mapped.get("description") or "") or None,
            approval_status="submitted",
        ))
        created += 1
    db.commit()
    return {"created": created, "errors": errors}


@router.get("/periods")
def list_periods(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(
        select(AccountingPeriod).where(AccountingPeriod.org_id == user.org_id)
        .order_by(AccountingPeriod.year.desc(), AccountingPeriod.month.desc())
    ).all()
    return {"items": [{"id": p.id, "year": p.year, "month": p.month, "status": p.status} for p in rows]}


@router.post("/periods/{year}/{month}/lock")
def lock_period(year: int, month: int, db: Session = Depends(get_db), user: User = Depends(require("lock_period"))):
    p = db.scalar(select(AccountingPeriod).where(AccountingPeriod.org_id == user.org_id, AccountingPeriod.year == year, AccountingPeriod.month == month))
    if not p:
        p = AccountingPeriod(org_id=user.org_id, year=year, month=month, status="locked")
        db.add(p)
    else:
        p.status = "locked"
    db.commit()
    return {"year": year, "month": month, "status": "locked"}


@router.post("/periods/{year}/{month}/unlock")
def unlock_period(year: int, month: int, db: Session = Depends(get_db), user: User = Depends(require("lock_period"))):
    p = db.scalar(select(AccountingPeriod).where(AccountingPeriod.org_id == user.org_id, AccountingPeriod.year == year, AccountingPeriod.month == month))
    if not p:
        raise HTTPException(404, "Period not found.")
    p.status = "open"
    db.commit()
    return {"year": year, "month": month, "status": "open"}


@router.post("/payroll")
def post_payroll(year: int, month: int, db: Session = Depends(get_db), user: User = Depends(require("approve"))):
    employees = db.scalars(select(Employee).where(Employee.org_id == user.org_id, Employee.status == "active")).all()
    if not employees:
        raise HTTPException(400, "No active employees to pay.")
    existing = db.scalar(select(SalaryRecord).where(
        SalaryRecord.org_id == user.org_id, SalaryRecord.period_year == year, SalaryRecord.period_month == month
    ))
    if existing:
        raise HTTPException(400, "Payroll for this month is already posted. Void it before re-posting.")
    total = sum((e.monthly_salary for e in employees), Decimal("0"))
    pay_day = date(year, month, min(28, 25))
    post_transaction(
        db, org_id=user.org_id, user_id=user.id, txn_date=pay_day,
        txn_type="payroll", amount=total, account_code="6000", contra_code="1010",
        description=f"Monthly payroll {pay_day.strftime('%b %Y')}",
        payment_status="paid", payment_method="bank", category="salaries", cost_nature="indirect",
    )
    for e in employees:
        db.add(SalaryRecord(
            org_id=user.org_id, employee_id=e.id, period_year=year, period_month=month,
            gross=e.monthly_salary, employer_cost=e.monthly_salary, status="posted",
        ))
    db.commit()
    return {"posted": len(employees), "total": float(total), "date": pay_day.isoformat()}
