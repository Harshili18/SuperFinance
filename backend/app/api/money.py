from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.db.session import get_db
from app.deps import current_user, require
from app.models import Camp, Clinician, Document, Employee, Expense, Invoice, InvoiceItem, Payment, Reimbursement, User, uid
from app.schemas import ClinicianPayoutIn, ExpenseIn, InvoiceIn, InvoiceSendIn, PaymentIn, ReimbursementIn, RevenueIn
from app.services.ledger import CATEGORY_ACCOUNT, REVENUE_ACCOUNT, audit, post_transaction, void_transaction
from app.services.finance import Filters, net_revenue

router = APIRouter(tags=["money"])


@router.get("/expenses")
def list_expenses(db: Session = Depends(get_db), user: User = Depends(require("view_ops_detail")), q: str | None = None, status: str | None = None):
    stmt = select(Expense).where(Expense.org_id == user.org_id)
    if status:
        stmt = stmt.where(Expense.approval_status == status)
    if q:
        stmt = stmt.where(func.lower(Expense.description).like(f"%{q.lower()}%"))
    rows = db.scalars(stmt.order_by(Expense.expense_date.desc()).limit(500)).all()
    clinicians = {c.id: c.name for c in db.scalars(select(Clinician).where(Clinician.org_id == user.org_id))}
    camps = {c.id: c.name for c in db.scalars(select(Camp).where(Camp.org_id == user.org_id))}
    employees = {e.id: e.name for e in db.scalars(select(Employee).where(Employee.org_id == user.org_id))}
    return {"items": [
        {"id": e.id, "number": e.expense_number, "date": e.expense_date.isoformat(), "amount": float(e.amount),
         "tax": float(e.tax_amount), "category": e.category, "subcategory": e.subcategory, "nature": e.cost_nature,
         "camp_id": e.camp_id, "camp": camps.get(e.camp_id) if e.camp_id else None,
         "employee_id": e.employee_id, "employee": employees.get(e.employee_id) if e.employee_id else None,
         "client_id": e.client_id, "clinician_id": e.clinician_id,
         "clinician": clinicians.get(e.clinician_id) if e.clinician_id else None,
         "status": e.approval_status, "payment_status": e.payment_status, "description": e.description,
         "source": "clinician" if e.clinician_id else "bill"}
        for e in rows
    ]}


@router.post("/expenses")
def create_expense(body: ExpenseIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    n = db.scalar(select(func.count()).select_from(Expense).where(Expense.org_id == user.org_id)) or 0
    cat = (body.category or "miscellaneous").lower()
    sub = (body.subcategory or "").lower() or None
    code = CATEGORY_ACCOUNT.get(sub or cat, CATEGORY_ACCOUNT.get(cat, "6900"))
    payload = body.model_dump()
    payload["category"] = cat
    payload["subcategory"] = sub
    if payload.get("camp_id") and payload.get("cost_nature") == "indirect":
        payload["cost_nature"] = "direct"
    e = Expense(org_id=user.org_id, expense_number=f"EXP-{int(n)+1:04d}", account_code=code,
                approval_status="submitted", **payload)
    db.add(e)
    audit(db, user.org_id, user.id, "create_expense", "expense", e.id, after=str(e.amount))
    db.commit()
    db.refresh(e)
    return {"id": e.id, "number": e.expense_number, "status": e.approval_status}


@router.post("/expenses/{expense_id}/approve")
def approve_expense(expense_id: str, db: Session = Depends(get_db), user: User = Depends(require("approve"))):
    e = db.get(Expense, expense_id)
    if not e or e.org_id != user.org_id:
        raise HTTPException(404, "Expense not found.")
    if e.approval_status == "approved":
        raise HTTPException(400, "Already approved.")
    e.approval_status = "approved"
    e.approved_by = user.id
    txn_type = "cogs" if e.cost_nature == "direct" else "expense"
    post_transaction(
        db, org_id=user.org_id, user_id=user.id, txn_date=e.expense_date,
        txn_type=txn_type, amount=e.amount, tax_amount=e.tax_amount,
        account_code=e.account_code or "6900",
        contra_code="2000" if e.payment_status != "paid" else "1010",
        description=e.description, payment_status=e.payment_status, payment_method=e.payment_method,
        category=e.category, subcategory=e.subcategory, cost_nature=e.cost_nature,
        dimensions={
            "camp_id": e.camp_id, "city_id": e.city_id, "client_id": e.client_id,
            "vendor_id": e.vendor_id, "employee_id": e.employee_id, "package_id": e.package_id,
            "diagnostic_partner_id": e.diagnostic_partner_id, "expense_id": e.id, "source": "expense",
            "channel": "camp" if e.camp_id else None, "business_model": None,
        },
    )
    db.commit()
    return {"id": e.id, "status": e.approval_status}


@router.post("/expenses/{expense_id}/reject")
def reject_expense(expense_id: str, db: Session = Depends(get_db), user: User = Depends(require("approve"))):
    e = db.get(Expense, expense_id)
    if not e or e.org_id != user.org_id:
        raise HTTPException(404, "Expense not found.")
    e.approval_status = "rejected"
    db.commit()
    return {"id": e.id, "status": e.approval_status}


@router.get("/invoices")
def list_invoices(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(Invoice).where(Invoice.org_id == user.org_id).options(joinedload(Invoice.client)).order_by(Invoice.invoice_date.desc())).unique().all()
    return {"items": [
        {"id": i.id, "number": i.number, "client": i.client.name if i.client else None, "date": i.invoice_date.isoformat(),
         "due_date": i.due_date.isoformat(), "total": float(i.total), "paid": float(i.amount_paid),
         "outstanding": float(i.total - i.amount_paid), "status": i.status}
        for i in rows
    ]}


@router.post("/invoices")
def create_invoice(body: InvoiceIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    n = db.scalar(select(func.count()).select_from(Invoice).where(Invoice.org_id == user.org_id)) or 0
    subtotal = Decimal("0")
    tax = Decimal("0")
    items = []
    for it in body.items:
        line = (it.quantity * it.rate) - it.discount
        line_tax = line * it.gst_rate / Decimal("100")
        subtotal += line
        tax += line_tax
        items.append(InvoiceItem(description=it.description, package_id=it.package_id, quantity=it.quantity,
                                 rate=it.rate, discount=it.discount, gst_rate=it.gst_rate, amount=line))
    inv = Invoice(
        org_id=user.org_id, number=f"INV-{n+1:04d}", client_id=body.client_id, camp_id=body.camp_id,
        city_id=body.city_id, billing_address=body.billing_address, gstin=body.gstin,
        invoice_date=body.invoice_date, due_date=body.due_date, subtotal=subtotal, tax_amount=tax,
        total=subtotal + tax, payment_terms=body.payment_terms, notes=body.notes, status="draft",
        created_by=user.id, items=items,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return {"id": inv.id, "number": inv.number, "status": inv.status, "total": float(inv.total)}


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    inv = db.scalar(select(Invoice).where(Invoice.id == invoice_id).options(joinedload(Invoice.items), joinedload(Invoice.client)))
    if not inv or inv.org_id != user.org_id:
        raise HTTPException(404, "Invoice not found.")
    return {
        "id": inv.id, "number": inv.number, "status": inv.status, "client": inv.client.name if inv.client else None,
        "gstin": inv.gstin, "billing_address": inv.billing_address, "date": inv.invoice_date.isoformat(),
        "due_date": inv.due_date.isoformat(), "subtotal": float(inv.subtotal), "tax": float(inv.tax_amount),
        "total": float(inv.total), "paid": float(inv.amount_paid), "notes": inv.notes, "payment_terms": inv.payment_terms,
        "items": [{"description": x.description, "qty": float(x.quantity), "rate": float(x.rate), "amount": float(x.amount), "gst_rate": float(x.gst_rate)} for x in inv.items],
    }


@router.post("/invoices/{invoice_id}/send")
def send_invoice(
    invoice_id: str,
    body: InvoiceSendIn = InvoiceSendIn(),
    db: Session = Depends(get_db),
    user: User = Depends(require("approve")),
):
    inv = db.scalar(select(Invoice).where(Invoice.id == invoice_id).options(joinedload(Invoice.items), joinedload(Invoice.client)))
    if not inv or inv.org_id != user.org_id:
        raise HTTPException(404, "Invoice not found.")
    if inv.status not in {"draft", "approved"}:
        raise HTTPException(400, "Only draft invoices can be sent.")
    payload = body
    channel = (payload.channel or "email").lower()
    if channel not in {"email", "whatsapp", "sms", "print"}:
        raise HTTPException(400, "Channel must be email, whatsapp, sms, or print.")
    if channel in {"email"} and not (payload.recipient_email or "").strip():
        raise HTTPException(400, "Enter a recipient email for email delivery.")
    if channel in {"whatsapp", "sms"} and not (payload.recipient_phone or "").strip():
        raise HTTPException(400, "Enter a recipient phone for WhatsApp/SMS.")

    from app.models import Transaction
    existing = db.scalar(
        select(Transaction.id).where(
            Transaction.org_id == user.org_id,
            Transaction.invoice_id == inv.id,
            Transaction.txn_type == "revenue",
            Transaction.status == "posted",
        )
    )
    if existing:
        raise HTTPException(400, "Revenue is already posted for this invoice. Use a linked collection (payment) instead of sending again.")
    inv.status = "sent"
    pkg_id = inv.items[0].package_id if inv.items else None
    post_transaction(
        db, org_id=user.org_id, user_id=user.id, txn_date=inv.invoice_date,
        txn_type="revenue", amount=inv.subtotal, tax_amount=inv.tax_amount, net_amount=inv.subtotal,
        account_code="4000", contra_code="1100",
        description=f"Invoice {inv.number}", payment_status="unpaid", category="b2b",
        dimensions={
            "camp_id": inv.camp_id, "city_id": inv.city_id, "client_id": inv.client_id,
            "package_id": pkg_id, "invoice_id": inv.id, "channel": "b2b", "business_model": "b2b", "source": "invoice",
        },
    )
    send_note = (
        f"channel={channel}; name={payload.recipient_name or ''}; "
        f"email={payload.recipient_email or ''}; phone={payload.recipient_phone or ''}"
    )
    if payload.message:
        send_note += f"; message={payload.message[:200]}"
    audit(
        db,
        user.org_id,
        user.id,
        "invoice.send",
        "invoice",
        inv.id,
        after=send_note,
        reason=(payload.message or "")[:255] or None,
    )
    db.commit()
    return {
        "id": inv.id,
        "status": inv.status,
        "channel": channel,
        "recipient_name": payload.recipient_name,
        "recipient_email": payload.recipient_email,
        "recipient_phone": payload.recipient_phone,
        "pdf_path": f"/api/v1/invoices/{inv.id}/pdf",
        "delivery": "recorded",
        "note": "Delivery intent recorded. Connect an email/SMS/WhatsApp provider for live sending; print opens the PDF.",
    }


@router.post("/payments")
def record_payment(body: PaymentIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    p = Payment(org_id=user.org_id, **body.model_dump())
    db.add(p)
    db.flush()
    if body.invoice_id:
        inv = db.get(Invoice, body.invoice_id)
        if not inv or inv.org_id != user.org_id:
            raise HTTPException(404, "Invoice not found.")
        inv.amount_paid += body.amount
        if inv.amount_paid >= inv.total:
            inv.status = "paid"
            inv.amount_paid = inv.total
        else:
            inv.status = "partially_paid"
        post_transaction(
            db, org_id=user.org_id, user_id=user.id, txn_date=body.payment_date,
            txn_type="payment_in", amount=body.amount, account_code="1010", contra_code="1100",
            description=f"Payment {inv.number}", payment_status="paid", payment_method=body.method,
            category="collections",
            dimensions={"invoice_id": inv.id, "client_id": inv.client_id, "camp_id": inv.camp_id,
                        "city_id": inv.city_id, "channel": "b2b", "business_model": "b2b", "source": "payment"},
        )
    elif body.direction == "out":
        post_transaction(
            db, org_id=user.org_id, user_id=user.id, txn_date=body.payment_date,
            txn_type="payment_out", amount=body.amount, account_code="1010", contra_code="2000",
            description=body.reference or "Vendor payment", payment_status="paid", payment_method=body.method,
            category="payout",
            dimensions={"vendor_id": body.vendor_id, "expense_id": body.expense_id,
                        "diagnostic_partner_id": body.partner_id, "source": "payment"},
        )
        if body.expense_id:
            e = db.get(Expense, body.expense_id)
            if e:
                e.payment_status = "paid"
    db.commit()
    return {"id": p.id}


@router.get("/payments")
def list_payments(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(Payment).where(Payment.org_id == user.org_id).order_by(Payment.payment_date.desc()).limit(500)).all()
    return {"items": [
        {"id": p.id, "date": p.payment_date.isoformat(), "direction": p.direction, "amount": float(p.amount),
         "method": p.method, "invoice_id": p.invoice_id, "reference": p.reference}
        for p in rows
    ]}


@router.post("/revenue")
def record_revenue(body: RevenueIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    channel = body.channel
    account = REVENUE_ACCOUNT.get(channel, "4090")
    contra = "1010" if body.payment_status == "paid" else "1100"
    txn = post_transaction(
        db, org_id=user.org_id, user_id=user.id, txn_date=body.txn_date,
        txn_type="revenue", amount=body.amount, tax_amount=body.tax_amount, discount_amount=body.discount_amount,
        account_code=account, contra_code=contra, description=body.description,
        payment_status=body.payment_status, payment_method=body.payment_method, category=channel,
        dimensions={
            "camp_id": body.camp_id, "city_id": body.city_id, "client_id": body.client_id,
            "customer_id": body.customer_id, "package_id": body.package_id,
            "diagnostic_partner_id": body.diagnostic_partner_id, "channel": channel,
            "business_model": body.business_model or ("b2b" if channel in {"b2b", "camp"} else "b2c"),
            "source": body.source or channel,
        },
    )
    db.commit()
    return {"id": txn.id}


@router.get("/revenue")
def list_revenue(db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.models import Transaction
    rows = db.scalars(
        select(Transaction).where(Transaction.org_id == user.org_id, Transaction.txn_type == "revenue", Transaction.status == "posted")
        .order_by(Transaction.txn_date.desc()).limit(500)
    ).all()
    return {"items": [
        {"id": t.id, "date": t.txn_date.isoformat(), "amount": float(t.net_amount), "channel": t.channel,
         "client_id": t.client_id, "camp_id": t.camp_id, "package_id": t.package_id,
         "status": t.payment_status, "description": t.description}
        for t in rows
    ]}


@router.get("/app-revenue")
def app_revenue(db: Session = Depends(get_db), user: User = Depends(current_user)):
    f = Filters(org_id=user.org_id, channel="app")
    from app.services.finance import direct_costs, monthly_series
    from app.models import Transaction
    rev = net_revenue(db, f)
    cost = direct_costs(db, f)
    count = db.scalar(
        select(func.count()).select_from(Transaction).where(
            Transaction.org_id == user.org_id, Transaction.channel == "app",
            Transaction.txn_type == "revenue", Transaction.status == "posted",
        )
    ) or 0
    return {
        "revenue": float(rev),
        "transactions": int(count),
        "aov": float(rev / count) if count else 0,
        "cogs": float(cost),
        "contribution": float(rev - cost),
        "margin": float((rev - cost) / rev * 100) if rev else 0,
        "monthly": monthly_series(db, f, ["revenue"]),
    }


def _reimb_row(r: Reimbursement, names: dict[str, str], camps: dict[str, str]) -> dict:
    kind = r.kind or ("camp" if r.camp_id else "monthly")
    return {
        "id": r.id, "employee_id": r.employee_id, "employee": names.get(r.employee_id),
        "date": r.claim_date.isoformat(), "kind": kind, "category": r.category,
        "amount": float(r.amount), "status": r.status, "description": r.description,
        "camp_id": r.camp_id, "camp": camps.get(r.camp_id) if r.camp_id else None,
        "period_year": r.period_year, "period_month": r.period_month,
        "label": "Camp reimbursement" if kind == "camp" else "Monthly reimbursement",
    }


@router.get("/reimbursements")
def list_reimb(db: Session = Depends(get_db), user: User = Depends(require("view_ops_detail")), kind: str | None = None, camp_id: str | None = None):
    stmt = select(Reimbursement).where(Reimbursement.org_id == user.org_id)
    if kind:
        stmt = stmt.where(Reimbursement.kind == kind)
    if camp_id:
        stmt = stmt.where(Reimbursement.camp_id == camp_id)
    rows = db.scalars(stmt.order_by(Reimbursement.claim_date.desc())).all()
    names = {e.id: e.name for e in db.scalars(select(Employee).where(Employee.org_id == user.org_id))}
    camps = {c.id: c.name for c in db.scalars(select(Camp).where(Camp.org_id == user.org_id))}
    items = [_reimb_row(r, names, camps) for r in rows]
    camp_total = sum(i["amount"] for i in items if i["kind"] == "camp")
    monthly_total = sum(i["amount"] for i in items if i["kind"] == "monthly")
    return {"items": items, "camp_total": camp_total, "monthly_total": monthly_total}


@router.post("/reimbursements")
def create_reimb(body: ReimbursementIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    data = body.model_dump()
    kind = data.get("kind") or ("camp" if data.get("camp_id") else "monthly")
    if kind == "camp" and not data.get("camp_id"):
        raise HTTPException(400, "Camp reimbursement needs a camp.")
    if kind == "monthly":
        data["camp_id"] = None
        if not data.get("period_year"):
            data["period_year"] = body.claim_date.year
            data["period_month"] = body.claim_date.month
    data["kind"] = kind
    if kind == "camp" and not data.get("description"):
        data["description"] = f"Camp reimbursement · {data['category']}"
    elif kind == "monthly" and not data.get("description"):
        data["description"] = f"Monthly reimbursement · {data['category']}"
    # Duplicate-claim check: same employee, date, amount, category (and camp if set)
    dup_q = select(Reimbursement).where(
        Reimbursement.org_id == user.org_id,
        Reimbursement.employee_id == data["employee_id"],
        Reimbursement.claim_date == data["claim_date"],
        Reimbursement.amount == data["amount"],
        Reimbursement.category == data["category"],
        Reimbursement.status != "rejected",
    )
    if data.get("camp_id"):
        dup_q = dup_q.where(Reimbursement.camp_id == data["camp_id"])
    if db.scalar(dup_q):
        raise HTTPException(400, "Possible duplicate claim: same employee, date, amount and category already exists.")
    r = Reimbursement(org_id=user.org_id, status="submitted", **data)
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id, "status": r.status, "kind": r.kind}


@router.post("/reimbursements/{rid}/approve")
def approve_reimb(rid: str, db: Session = Depends(get_db), user: User = Depends(require("approve"))):
    r = db.get(Reimbursement, rid)
    if not r or r.org_id != user.org_id:
        raise HTTPException(404, "Reimbursement not found.")
    r.status = "approved"
    db.commit()
    return {"id": r.id, "status": r.status}


@router.post("/reimbursements/{rid}/pay")
def pay_reimb(rid: str, db: Session = Depends(get_db), user: User = Depends(require("approve"))):
    r = db.get(Reimbursement, rid)
    if not r or r.org_id != user.org_id:
        raise HTTPException(404, "Reimbursement not found.")
    r.status = "paid"
    kind = r.kind or ("camp" if r.camp_id else "monthly")
    camp = db.get(Camp, r.camp_id) if r.camp_id else None
    is_camp = kind == "camp"
    emp = db.get(Employee, r.employee_id)
    who = emp.name if emp else "staff"
    if is_camp:
        label = f"Camp reimbursement · {r.category} · {who}"
        if camp:
            label += f" · {camp.name}"
        account, nature, channel = CATEGORY_ACCOUNT.get(r.category, "5040"), "direct", "camp"
        category = r.category
    else:
        label = r.description or f"Monthly reimbursement · {r.category} · {who}"
        account, nature, channel = CATEGORY_ACCOUNT.get(r.category, "6010"), "indirect", None
        category = "monthly"
    post_transaction(
        db, org_id=user.org_id, user_id=user.id, txn_date=r.claim_date,
        txn_type="reimbursement", amount=r.amount, account_code=account, contra_code="1010",
        description=label, payment_status="paid", category=category, cost_nature=nature,
        dimensions={
            "employee_id": r.employee_id, "camp_id": r.camp_id if is_camp else None,
            "city_id": camp.city_id if camp else None, "client_id": r.client_id or (camp.client_id if camp else None),
            "source": "reimbursement", "channel": channel, "business_model": camp.channel if camp and camp.channel in {"b2b", "b2c"} else None,
        },
    )
    db.commit()
    return {"id": r.id, "status": r.status}


@router.post("/clinicians/{cid}/payout")
def clinician_payout(cid: str, body: ClinicianPayoutIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    c = db.get(Clinician, cid)
    if not c or c.org_id != user.org_id:
        raise HTTPException(404, "Clinician not found.")
    camp = db.get(Camp, body.camp_id) if body.camp_id else None
    if body.camp_id and (not camp or camp.org_id != user.org_id):
        raise HTTPException(400, "Camp not found.")
    cat = "doctors" if c.kind == "doctor" else "nutritionists"
    n = db.scalar(select(func.count()).select_from(Expense).where(Expense.org_id == user.org_id)) or 0
    nature = "direct" if camp else "indirect"
    desc = body.description or f"{c.kind.title()} payout · {c.name}" + (f" · {camp.name}" if camp else "")
    e = Expense(
        org_id=user.org_id, expense_number=f"EXP-{int(n)+1:04d}", expense_date=body.payout_date,
        amount=body.amount, category=cat, cost_nature=nature, clinician_id=c.id,
        camp_id=camp.id if camp else None, city_id=camp.city_id if camp else None,
        client_id=camp.client_id if camp else None, description=desc,
        approval_status="approved", payment_status="paid", approved_by=user.id,
        account_code=CATEGORY_ACCOUNT.get(cat, "5020"), created_by=user.id,
    )
    db.add(e)
    db.flush()
    post_transaction(
        db, org_id=user.org_id, user_id=user.id, txn_date=e.expense_date,
        txn_type="cogs" if nature == "direct" else "expense", amount=e.amount,
        account_code=e.account_code or "5020", contra_code="1010",
        description=e.description, payment_status="paid", category=cat, cost_nature=nature,
        dimensions={
            "camp_id": e.camp_id, "city_id": e.city_id, "client_id": e.client_id,
            "expense_id": e.id, "source": "clinician", "channel": "camp" if camp else None,
        },
    )
    audit(db, user.org_id, user.id, "clinician_payout", "expense", e.id, after=str(e.amount))
    db.commit()
    return {"id": e.id, "number": e.expense_number, "status": e.approval_status}


@router.post("/documents")
async def upload_doc(
    entity_type: str,
    entity_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require("create")),
):
    data = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(400, f"File exceeds {settings.max_upload_mb} MB limit.")
    allowed = {
        "application/pdf", "image/jpeg", "image/png", "image/jpg",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }
    ctype = file.content_type or "application/octet-stream"
    if ctype not in allowed:
        raise HTTPException(400, f"File type {ctype} is not allowed.")
    import re
    from pathlib import Path as _P

    safe = re.sub(r"[^A-Za-z0-9._-]", "_", _P(file.filename or "file").name)[:80] or "file"
    stored = f"{uid()}_{safe}"
    path = settings.storage_path / stored
    path.write_bytes(data)
    doc = Document(
        org_id=user.org_id, filename=file.filename or stored, stored_name=stored,
        content_type=ctype, size_bytes=len(data), entity_type=entity_type, entity_id=entity_id,
        uploaded_by=user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "filename": doc.filename}


@router.get("/documents")
def list_docs(entity_type: str | None = None, entity_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(require("view_ops_detail"))):
    stmt = select(Document).where(Document.org_id == user.org_id)
    if entity_type:
        stmt = stmt.where(Document.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(Document.entity_id == entity_id)
    rows = db.scalars(stmt.order_by(Document.created_at.desc()).limit(200)).all()
    return {"items": [
        {"id": d.id, "filename": d.filename, "entity_type": d.entity_type, "entity_id": d.entity_id,
         "size": d.size_bytes, "created_at": d.created_at.isoformat() if d.created_at else None}
        for d in rows
    ]}


@router.get("/notifications")
def list_notes(db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.models import Notification
    rows = db.scalars(select(Notification).where(Notification.org_id == user.org_id).order_by(Notification.created_at.desc()).limit(50)).all()
    return {"items": [
        {"id": n.id, "title": n.title, "body": n.body, "kind": n.kind, "is_read": n.is_read}
        for n in rows
    ]}


@router.post("/import/expenses")
async def import_expenses(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(require("create"))):
    import csv
    import io
    raw = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    required = {"date", "amount", "category"}
    if not reader.fieldnames or not required.issubset({h.strip().lower() for h in reader.fieldnames}):
        raise HTTPException(400, "CSV must include date, amount, category columns.")
    created = 0
    errors = []
    n = db.scalar(select(func.count()).select_from(Expense).where(Expense.org_id == user.org_id)) or 0
    from datetime import date as dtdate
    for i, row in enumerate(reader, start=2):
        mapped = {k.strip().lower(): v.strip() for k, v in row.items() if k}
        try:
            amt = Decimal(mapped["amount"].replace(",", ""))
            dt = dtdate.fromisoformat(mapped["date"])
        except Exception:
            errors.append({"row": i, "error": "Invalid date or amount."})
            continue
        n += 1
        e = Expense(
            org_id=user.org_id, expense_number=f"EXP-{int(n):04d}", expense_date=dt,
            amount=amt, category=mapped["category"], cost_nature=mapped.get("nature") or "indirect",
            description=mapped.get("description"), approval_status="submitted",
        )
        db.add(e)
        created += 1
    db.commit()
    return {"created": created, "errors": errors}
