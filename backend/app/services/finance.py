from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Account,
    Budget,
    Camp,
    Client,
    DiagnosticPartner,
    Employee,
    Expense,
    Invoice,
    JournalLine,
    Package,
    PackageCost,
    Reimbursement,
    SalaryRecord,
    Transaction,
)
from app.services.ledger import expense_bucket

D0 = Decimal("0.00")
Q = Decimal("0.01")


def D(v: Any) -> Decimal:
    if v is None:
        return D0
    if isinstance(v, Decimal):
        return v.quantize(Q, rounding=ROUND_HALF_UP)
    return Decimal(str(v)).quantize(Q, rounding=ROUND_HALF_UP)


def pct(num: Decimal, den: Decimal) -> Decimal | None:
    if den == 0:
        return None
    return (num / den * Decimal("100")).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def money(v: Decimal) -> float:
    return float(D(v))


@dataclass
class Filters:
    org_id: str
    date_from: date | None = None
    date_to: date | None = None
    city_id: str | None = None
    client_id: str | None = None
    camp_id: str | None = None
    package_id: str | None = None
    channel: str | None = None
    business_model: str | None = None
    diagnostic_partner_id: str | None = None
    vendor_id: str | None = None
    employee_id: str | None = None


def previous_period(f: Filters) -> Filters:
    if not f.date_from or not f.date_to:
        return Filters(org_id=f.org_id)
    span = (f.date_to - f.date_from).days + 1
    end = f.date_from - timedelta(days=1)
    start = end - timedelta(days=span - 1)
    return Filters(
        org_id=f.org_id,
        date_from=start,
        date_to=end,
        city_id=f.city_id,
        client_id=f.client_id,
        camp_id=f.camp_id,
        package_id=f.package_id,
        channel=f.channel,
        business_model=f.business_model,
        diagnostic_partner_id=f.diagnostic_partner_id,
    )


def apply_dims(stmt: Select, f: Filters) -> Select:
    t = Transaction
    stmt = stmt.where(t.org_id == f.org_id, t.status == "posted")
    if f.date_from:
        stmt = stmt.where(t.txn_date >= f.date_from)
    if f.date_to:
        stmt = stmt.where(t.txn_date <= f.date_to)
    if f.city_id:
        stmt = stmt.where(t.city_id == f.city_id)
    if f.client_id:
        stmt = stmt.where(t.client_id == f.client_id)
    if f.camp_id:
        stmt = stmt.where(t.camp_id == f.camp_id)
    if f.package_id:
        stmt = stmt.where(t.package_id == f.package_id)
    if f.channel:
        stmt = stmt.where(t.channel == f.channel)
    if f.business_model:
        stmt = stmt.where(t.business_model == f.business_model)
    if f.diagnostic_partner_id:
        stmt = stmt.where(t.diagnostic_partner_id == f.diagnostic_partner_id)
    if f.vendor_id:
        stmt = stmt.where(t.vendor_id == f.vendor_id)
    if f.employee_id:
        stmt = stmt.where(t.employee_id == f.employee_id)
    return stmt


def _sum(db: Session, f: Filters, types: list[str] | None = None, extra=None) -> Decimal:
    stmt = select(func.coalesce(func.sum(Transaction.net_amount), 0))
    stmt = apply_dims(stmt, f)
    if types:
        stmt = stmt.where(Transaction.txn_type.in_(types))
    if extra is not None:
        stmt = stmt.where(extra)
    return D(db.execute(stmt).scalar())


def revenue(db: Session, f: Filters) -> Decimal:
    return _sum(db, f, ["revenue"])


def refunds(db: Session, f: Filters) -> Decimal:
    return _sum(db, f, ["refund"])


def net_revenue(db: Session, f: Filters) -> Decimal:
    return revenue(db, f) - refunds(db, f)


def direct_costs(db: Session, f: Filters) -> Decimal:
    return _sum(db, f, ["cogs"]) + _sum(
        db, f, ["expense", "reimbursement"], Transaction.cost_nature == "direct"
    )


def opex(db: Session, f: Filters) -> Decimal:
    # Allocated camp costs are memo dimensions — payroll already hit company opex.
    return _sum(
        db,
        f,
        ["expense", "payroll", "reimbursement"],
        or_(Transaction.cost_nature.is_(None), Transaction.cost_nature == "indirect"),
    )


def cash_balance(db: Session, f: Filters) -> Decimal:
    cash_codes = db.scalars(select(Account.code).where(Account.org_id == f.org_id, Account.is_cash.is_(True))).all()
    if not cash_codes:
        cash_codes = ["1000", "1010"]
    stmt = (
        select(
            func.coalesce(func.sum(JournalLine.debit), 0) - func.coalesce(func.sum(JournalLine.credit), 0)
        )
        .select_from(JournalLine)
        .join(JournalLine.entry)
        .where(
            JournalLine.account_code.in_(cash_codes),
        )
    )
    # Filter by org via entry
    from app.models import JournalEntry
    stmt = stmt.where(JournalEntry.org_id == f.org_id, JournalEntry.status == "posted")
    if f.date_to:
        stmt = stmt.where(JournalEntry.entry_date <= f.date_to)
    return D(db.execute(stmt).scalar())


def receivables(db: Session, f: Filters) -> Decimal:
    stmt = select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0)).where(
        Invoice.org_id == f.org_id,
        Invoice.status.in_(["sent", "viewed", "partially_paid", "overdue"]),
    )
    if f.client_id:
        stmt = stmt.where(Invoice.client_id == f.client_id)
    if f.city_id:
        stmt = stmt.where(Invoice.city_id == f.city_id)
    if f.camp_id:
        stmt = stmt.where(Invoice.camp_id == f.camp_id)
    return D(db.execute(stmt).scalar())


def payables(db: Session, f: Filters) -> Decimal:
    from app.models import Expense
    stmt = select(func.coalesce(func.sum(Expense.amount + Expense.tax_amount), 0)).where(
        Expense.org_id == f.org_id,
        Expense.approval_status.in_(["approved", "finance_review"]),
        Expense.payment_status.in_(["unpaid", "partial"]),
    )
    if f.camp_id:
        stmt = stmt.where(Expense.camp_id == f.camp_id)
    if f.city_id:
        stmt = stmt.where(Expense.city_id == f.city_id)
    return D(db.execute(stmt).scalar())


def monthly_burn(db: Session, f: Filters) -> Decimal:
    """Average monthly cash outflow from credits to cash/bank (journal), not P&L mix."""
    from app.models import JournalEntry

    cash_codes = db.scalars(select(Account.code).where(Account.org_id == f.org_id, Account.is_cash.is_(True))).all()
    if not cash_codes:
        cash_codes = ["1000", "1010"]
    stmt = (
        select(func.coalesce(func.sum(JournalLine.credit), 0))
        .select_from(JournalLine)
        .join(JournalLine.entry)
        .where(
            JournalEntry.org_id == f.org_id,
            JournalEntry.status == "posted",
            JournalLine.account_code.in_(cash_codes),
        )
    )
    if f.date_from:
        stmt = stmt.where(JournalEntry.entry_date >= f.date_from)
    if f.date_to:
        stmt = stmt.where(JournalEntry.entry_date <= f.date_to)
    out = D(db.execute(stmt).scalar())
    if not f.date_from or not f.date_to:
        return out
    months = max(1, round((f.date_to - f.date_from).days / 30) or 1)
    return D(out / Decimal(months))


def trend(current: Decimal, previous: Decimal) -> dict:
    change = None if previous == 0 else pct(current - previous, previous)
    return {
        "value": money(current),
        "previous": money(previous),
        "change_pct": float(change) if change is not None else None,
        "direction": "up" if current >= previous else "down",
    }


def executive_kpis(db: Session, f: Filters) -> dict:
    prev = previous_period(f)
    rev = net_revenue(db, f)
    dc = direct_costs(db, f)
    gp = rev - dc
    ox = opex(db, f)
    ebitda = gp - ox
    # Net = EBITDA until depreciation / interest / tax are posted
    net = ebitda
    total_expenses = dc + ox
    cash = cash_balance(db, f)
    burn = monthly_burn(db, f)
    runway = None if burn <= 0 else float((cash / burn).quantize(Decimal("0.1")))
    prev_rev = net_revenue(db, prev)
    prev_gp = prev_rev - direct_costs(db, prev)
    prev_ox = opex(db, prev)
    prev_ebitda = prev_gp - prev_ox
    prev_net = prev_ebitda
    explain = cash_explanation(db, f)
    return {
        "revenue": trend(rev, prev_rev),
        "total_expenses": trend(total_expenses, direct_costs(db, prev) + prev_ox),
        "gross_profit": trend(gp, prev_gp),
        "gross_margin": {"value": float(pct(gp, rev) or 0), "previous": float(pct(prev_gp, prev_rev) or 0)},
        "operating_expenses": trend(ox, prev_ox),
        "ebitda": trend(ebitda, prev_ebitda),
        "net_profit": trend(net, prev_net),
        "cash_balance": {
            "value": money(cash),
            "previous": None,
            "change_pct": None,
            "direction": "down" if cash < 0 else "flat",
        },
        "receivables": {"value": money(receivables(db, f)), "previous": None, "change_pct": None, "direction": "flat"},
        "payables": {"value": money(payables(db, f)), "previous": None, "change_pct": None, "direction": "flat"},
        "burn_rate": {"value": money(burn), "previous": None, "change_pct": None, "direction": "flat"},
        "runway_months": runway,
        "cash_explanation": explain,
        "period": {"from": f.date_from.isoformat() if f.date_from else None, "to": f.date_to.isoformat() if f.date_to else None},
    }


def group_sum(db: Session, f: Filters, types: list[str], group) -> list[dict]:
    stmt = select(group, func.coalesce(func.sum(Transaction.net_amount), 0).label("total"))
    stmt = apply_dims(stmt, f).where(Transaction.txn_type.in_(types)).group_by(group)
    rows = db.execute(stmt).all()
    return [{"key": r[0] or "unassigned", "amount": money(D(r[1]))} for r in rows]


def monthly_series(db: Session, f: Filters, types: list[str]) -> list[dict]:
    month_expr = func.strftime("%Y-%m", Transaction.txn_date)
    if db.bind and db.bind.dialect.name == "postgresql":
        month_expr = func.to_char(Transaction.txn_date, "YYYY-MM")
    stmt = select(month_expr.label("month"), func.coalesce(func.sum(Transaction.net_amount), 0))
    stmt = apply_dims(stmt, f).where(Transaction.txn_type.in_(types)).group_by(month_expr).order_by(month_expr)
    return [{"month": r[0], "amount": money(D(r[1]))} for r in db.execute(stmt).all()]


def pnl(db: Session, f: Filters) -> dict:
    """Accrual P&L from posted transactions. Net profit = EBITDA until D&A/interest/tax exist."""
    total_rev = net_revenue(db, f)
    total_cogs = direct_costs(db, f)
    gp = total_rev - total_cogs
    total_opex = opex(db, f)
    ebitda = gp - total_opex
    depreciation = D0
    interest = D0
    taxes = D0
    net = ebitda - depreciation - interest - taxes
    # Line items must match totals: opex only indirect / null cost_nature
    stmt = select(
        Transaction.account_code,
        func.coalesce(func.sum(Transaction.net_amount), 0),
    )
    stmt = (
        apply_dims(stmt, f)
        .where(
            Transaction.txn_type.in_(["expense", "payroll", "reimbursement"]),
            or_(Transaction.cost_nature.is_(None), Transaction.cost_nature == "indirect"),
        )
        .group_by(Transaction.account_code)
    )
    opex_rows = [{"key": r[0] or "unassigned", "amount": money(D(r[1]))} for r in db.execute(stmt).all()]
    return {
        "revenue_lines": group_sum(db, f, ["revenue"], Transaction.account_code),
        "total_revenue": money(total_rev),
        "cogs_lines": group_sum(db, f, ["cogs"], Transaction.account_code),
        "total_cogs": money(total_cogs),
        "gross_profit": money(gp),
        "gross_margin": float(pct(gp, total_rev) or 0),
        "opex_lines": opex_rows,
        "total_opex": money(total_opex),
        "ebitda": money(ebitda),
        "depreciation": money(depreciation),
        "interest": money(interest),
        "taxes": money(taxes),
        "net_profit": money(net),
        "net_margin": float(pct(net, total_rev) or 0),
        "formulas": {
            "gross_profit": "net_revenue - direct_costs (cogs + direct expense/reimbursement)",
            "ebitda": "gross_profit - operating_expenses (indirect expense/payroll/reimbursement)",
            "net_profit": "ebitda - depreciation - interest - taxes",
            "note": "Camp allocated costs are excluded from company opex to avoid double-counting payroll.",
        },
    }


def _cash_codes(db: Session, org_id: str) -> list[str]:
    codes = db.scalars(select(Account.code).where(Account.org_id == org_id, Account.is_cash.is_(True))).all()
    return list(codes) or ["1000", "1010"]


def _journal_cash_movement(db: Session, f: Filters) -> tuple[Decimal, Decimal]:
    """Cash inflows = debits to cash; outflows = credits to cash (posted journals)."""
    from app.models import JournalEntry

    cash_codes = _cash_codes(db, f.org_id)
    base = (
        select(
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .select_from(JournalLine)
        .join(JournalLine.entry)
        .where(
            JournalEntry.org_id == f.org_id,
            JournalEntry.status == "posted",
            JournalLine.account_code.in_(cash_codes),
        )
    )
    if f.date_from:
        base = base.where(JournalEntry.entry_date >= f.date_from)
    if f.date_to:
        base = base.where(JournalEntry.entry_date <= f.date_to)
    row = db.execute(base).one()
    return D(row[0]), D(row[1])


def _cash_breakdown(db: Session, f: Filters) -> dict:
    """Classify cash journal activity using linked transaction types when available."""
    from app.models import JournalEntry

    cash_codes = _cash_codes(db, f.org_id)
    stmt = (
        select(
            Transaction.txn_type,
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .select_from(JournalLine)
        .join(JournalLine.entry)
        .outerjoin(Transaction, Transaction.id == JournalEntry.source_transaction_id)
        .where(
            JournalEntry.org_id == f.org_id,
            JournalEntry.status == "posted",
            JournalLine.account_code.in_(cash_codes),
        )
        .group_by(Transaction.txn_type)
    )
    if f.date_from:
        stmt = stmt.where(JournalEntry.entry_date >= f.date_from)
    if f.date_to:
        stmt = stmt.where(JournalEntry.entry_date <= f.date_to)
    collections = other_in = supplier = employee = other_out = D0
    for txn_type, debit, credit in db.execute(stmt).all():
        d, c = D(debit), D(credit)
        t = (txn_type or "other").lower()
        if d > 0:
            if t in {"payment_in", "revenue"}:
                collections += d
            else:
                other_in += d
        if c > 0:
            if t in {"payroll", "reimbursement"}:
                employee += c
            elif t in {"expense", "cogs", "payment_out"}:
                supplier += c
            else:
                other_out += c
    return {
        "customer_collections": money(collections),
        "other_inflows": money(other_in),
        "supplier_payments": money(supplier),
        "employee_payments": money(employee),
        "other_outflows": money(other_out),
    }


def _cash_by_account(db: Session, f: Filters) -> list[dict]:
    from app.models import JournalEntry

    names = {
        a.code: a.name
        for a in db.scalars(select(Account).where(Account.org_id == f.org_id, Account.is_cash.is_(True))).all()
    }
    codes = list(names) or ["1000", "1010"]
    stmt = (
        select(
            JournalLine.account_code,
            func.coalesce(func.sum(JournalLine.debit), 0) - func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .select_from(JournalLine)
        .join(JournalLine.entry)
        .where(
            JournalEntry.org_id == f.org_id,
            JournalEntry.status == "posted",
            JournalLine.account_code.in_(codes),
        )
        .group_by(JournalLine.account_code)
    )
    if f.date_to:
        stmt = stmt.where(JournalEntry.entry_date <= f.date_to)
    rows = []
    for code, bal in db.execute(stmt).all():
        rows.append({
            "account_code": code,
            "account_name": names.get(code, code),
            "balance": money(D(bal)),
            "kind": "bank" if code.startswith("101") or "bank" in (names.get(code) or "").lower() else "cash",
        })
    return rows


def _monthly_cashflow(db: Session, f: Filters) -> list[dict]:
    from app.models import JournalEntry

    cash_codes = _cash_codes(db, f.org_id)
    month_expr = func.strftime("%Y-%m", JournalEntry.entry_date)
    if db.bind and db.bind.dialect.name == "postgresql":
        month_expr = func.to_char(JournalEntry.entry_date, "YYYY-MM")
    stmt = (
        select(
            month_expr.label("month"),
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .select_from(JournalLine)
        .join(JournalLine.entry)
        .where(
            JournalEntry.org_id == f.org_id,
            JournalEntry.status == "posted",
            JournalLine.account_code.in_(cash_codes),
        )
        .group_by(month_expr)
        .order_by(month_expr)
    )
    if f.date_from:
        stmt = stmt.where(JournalEntry.entry_date >= f.date_from)
    if f.date_to:
        stmt = stmt.where(JournalEntry.entry_date <= f.date_to)
    out = []
    for month, debit, credit in db.execute(stmt).all():
        d, c = D(debit), D(credit)
        out.append({
            "month": month,
            "inflows": money(d),
            "outflows": money(c),
            "net": money(d - c),
        })
    return out


def cashflow(db: Session, f: Filters) -> dict:
    """Cash-basis statement from cash/bank journal lines — not accrual P&L."""
    opening_f = Filters(org_id=f.org_id, date_to=(f.date_from - timedelta(days=1)) if f.date_from else None)
    opening = cash_balance(db, opening_f) if f.date_from else D0
    cash_in, cash_out = _journal_cash_movement(db, f)
    closing = opening + cash_in - cash_out
    breakdown = _cash_breakdown(db, f)
    return {
        "opening_cash": money(opening),
        "cash_inflows": money(cash_in),
        "cash_outflows": money(cash_out),
        "operating_cash_flow": money(cash_in - cash_out),
        "investing_cash_flow": 0,
        "financing_cash_flow": 0,
        "closing_cash": money(closing),
        "basis": "Posted journal debits/credits on cash and bank accounts",
        "burn_definition": "Monthly burn on the dashboard is average gross cash outflow (credits to cash/bank), not net burn.",
        "reconciliation": {
            "opening": money(opening),
            "plus_inflows": money(cash_in),
            "minus_outflows": money(cash_out),
            "equals_closing": money(closing),
            "checks_out": abs(float(closing - (opening + cash_in - cash_out))) < 0.01,
            "formula": "Opening + Inflows − Outflows = Closing",
        },
        "breakdown": breakdown,
        "by_account": _cash_by_account(db, f),
        "monthly": _monthly_cashflow(db, f),
        "receivables": money(receivables(db, f)),
        "payables": money(payables(db, f)),
    }


def cash_explanation(db: Session, f: Filters) -> dict:
    cash = cash_balance(db, f)
    burn = monthly_burn(db, f)
    runway = None if burn <= 0 else float((cash / burn).quantize(Decimal("0.1")))
    ar = aging(db, f.org_id, date.today())
    _, cash_out = _journal_cash_movement(db, f)
    reasons = []
    if cash < 0:
        reasons.append(f"Cash/bank journal balance is negative (₹{money(cash):,.0f}). Outflows exceed deposits posted to cash accounts.")
    if cash_out > 0:
        reasons.append(f"Period cash outflows total ₹{money(cash_out):,.0f} (credits to cash/bank).")
    if ar["total"] > 0:
        reasons.append(f"₹{ar['total']:,.0f} sits in receivables — collections would improve cash.")
    if burn > 0 and runway is not None and runway < 3:
        reasons.append(f"At current burn (₹{money(burn):,.0f}/mo), runway is {runway} months.")
    # Top expense categories this period
    cats = group_sum(db, f, ["expense", "cogs", "payroll", "reimbursement"], Transaction.category)[:5]
    return {
        "cash": money(cash),
        "burn": money(burn),
        "runway_months": runway,
        "receivables": ar["total"],
        "reasons": reasons,
        "top_spend": cats,
        "needs_attention": cash < 0 or (runway is not None and runway < 3),
    }


def drill_transactions(db: Session, f: Filters, metric: str, limit: int = 200) -> dict:
    """Underlying posted rows for a KPI click-through."""
    stmt = select(Transaction)
    stmt = apply_dims(stmt, f)
    metric = (metric or "all").lower()
    if metric in {"revenue", "total_revenue"}:
        stmt = stmt.where(Transaction.txn_type == "revenue")
    elif metric in {"expenses", "total_expenses", "operating_expenses", "opex"}:
        stmt = stmt.where(
            Transaction.txn_type.in_(["expense", "payroll", "reimbursement"]),
            or_(Transaction.cost_nature.is_(None), Transaction.cost_nature == "indirect"),
        )
    elif metric in {"gross_profit", "direct_costs", "cogs"}:
        stmt = stmt.where(
            or_(
                Transaction.txn_type == "cogs",
                and_(
                    Transaction.txn_type.in_(["expense", "reimbursement"]),
                    Transaction.cost_nature == "direct",
                ),
            )
        )
    elif metric in {"ebitda", "net_profit"}:
        stmt = stmt.where(Transaction.txn_type.in_(["revenue", "cogs", "expense", "payroll", "reimbursement", "refund"]))
    elif metric in {"receivables"}:
        # return unpaid invoices as pseudo-rows via aging details
        return {"metric": metric, "items": aging(db, f.org_id, date.today())["invoices"][:limit]}
    elif metric in {"payables"}:
        rows = db.scalars(
            select(Expense).where(
                Expense.org_id == f.org_id,
                Expense.approval_status.in_(["approved", "finance_review"]),
                Expense.payment_status.in_(["unpaid", "partial"]),
            ).limit(limit)
        ).all()
        return {
            "metric": metric,
            "items": [
                {
                    "id": e.id,
                    "date": e.expense_date.isoformat(),
                    "type": "payable",
                    "category": e.category,
                    "description": e.description,
                    "amount": float(e.amount),
                    "status": e.payment_status,
                }
                for e in rows
            ],
        }
    else:
        stmt = stmt.where(Transaction.txn_type.in_(["revenue", "cogs", "expense", "payroll", "reimbursement", "payment_in", "payment_out", "refund"]))
    rows = db.scalars(stmt.order_by(Transaction.txn_date.desc()).limit(limit)).all()
    return {
        "metric": metric,
        "items": [
            {
                "id": t.id,
                "date": t.txn_date.isoformat(),
                "type": t.txn_type,
                "category": t.category,
                "subcategory": t.subcategory,
                "description": t.description,
                "amount": float(t.net_amount),
                "payment_status": t.payment_status,
                "camp_id": t.camp_id,
                "client_id": t.client_id,
                "channel": t.channel,
                "cost_nature": t.cost_nature,
            }
            for t in rows
        ],
    }


def list_ledger_transactions(
    db: Session,
    f: Filters,
    tab: str = "all",
    limit: int = 500,
) -> dict:
    stmt = select(Transaction)
    stmt = apply_dims(stmt, f)
    tab = (tab or "all").lower()
    if tab == "income":
        stmt = stmt.where(Transaction.txn_type.in_(["revenue", "payment_in"]))
    elif tab == "expenses":
        stmt = stmt.where(Transaction.txn_type.in_(["expense", "cogs", "payroll", "reimbursement", "payment_out"]))
    elif tab == "payments":
        stmt = stmt.where(Transaction.txn_type.in_(["payment_in", "payment_out"]))
    elif tab == "adjustments":
        stmt = stmt.where(Transaction.txn_type.in_(["refund", "transfer"]))
    rows = db.scalars(stmt.order_by(Transaction.txn_date.desc()).limit(limit)).all()
    return {
        "items": [
            {
                "id": t.id,
                "date": t.txn_date.isoformat(),
                "type": t.txn_type,
                "category": t.category,
                "subcategory": t.subcategory,
                "description": t.description,
                "amount": float(t.net_amount),
                "tax": float(t.tax_amount or 0),
                "payment_status": t.payment_status,
                "payment_method": t.payment_method,
                "camp_id": t.camp_id,
                "client_id": t.client_id,
                "channel": t.channel,
                "cost_nature": t.cost_nature,
                "direction": "in" if t.txn_type in {"revenue", "payment_in"} else "out",
            }
            for t in rows
        ]
    }


def camp_pnl(db: Session, camp: Camp) -> dict:
    f = Filters(org_id=camp.org_id, camp_id=camp.id)
    rev = net_revenue(db, f)
    direct = direct_costs(db, f)
    allocated = _sum(db, f, ["expense", "payroll"], Transaction.cost_nature == "allocated")
    total_cost = direct + allocated
    contribution = rev - direct
    net = rev - total_cost
    attendees = camp.actual_attendees or 0
    inv = total_cost if total_cost > 0 else camp.budget
    roi = float(pct(net, inv) or 0) if inv else 0
    inv_rows = db.scalars(
        select(Invoice).where(Invoice.org_id == camp.org_id, Invoice.camp_id == camp.id, Invoice.status != "draft")
    ).all()
    invoice_amount = sum((D(i.total) for i in inv_rows), D0)
    collected = sum((D(i.amount_paid) for i in inv_rows), D0)
    outstanding = sum((max(D0, D(i.total) - D(i.amount_paid)) for i in inv_rows), D0)
    flags = []
    if net < 0:
        flags.append("negative_profit")
    if rev > 0 and pct(net, rev) is not None and float(pct(net, rev) or 0) < 20:
        flags.append("low_margin")
    if camp.budget and total_cost > D(camp.budget):
        flags.append("overspend")
    if outstanding > 0:
        flags.append("unpaid_invoices")
    planned = D(camp.expected_revenue or 0)
    return {
        "camp_id": camp.id,
        "name": camp.name,
        "status": camp.status,
        "financial_status": "loss" if net < 0 else ("thin" if (rev > 0 and float(pct(net, rev) or 0) < 20) else "healthy"),
        "city_id": camp.city_id,
        "client_id": camp.client_id,
        "channel": camp.channel,
        "date": camp.camp_date.isoformat(),
        "attendees": attendees,
        "budget": money(D(camp.budget)),
        "expected_revenue": money(planned),
        "planned_vs_actual": {
            "revenue_planned": money(planned),
            "revenue_actual": money(rev),
            "cost_budget": money(D(camp.budget)),
            "cost_actual": money(total_cost),
            "revenue_variance": money(rev - planned),
            "cost_variance": money(total_cost - D(camp.budget)),
        },
        "revenue": money(rev),
        "direct_cost": money(direct),
        "allocated_cost": money(allocated),
        "total_cost": money(total_cost),
        "contribution": money(contribution),
        "gross_profit": money(contribution),
        "net_profit": money(net),
        "margin": float(pct(net, rev) or 0),
        "roi": roi,
        "roi_definition": "Camp net profit ÷ camp investment (total cost, or budget if no cost) × 100",
        "invoice_amount": money(invoice_amount),
        "amount_collected": money(collected),
        "outstanding_receivable": money(outstanding),
        "flags": flags,
        "revenue_per_attendee": money(rev / attendees) if attendees else 0,
        "cost_per_attendee": money(total_cost / attendees) if attendees else 0,
        "profit_per_attendee": money(net / attendees) if attendees else 0,
    }


def camps_with_pnl(db: Session, camps: list[Camp]) -> list[dict]:
    """One grouped query for a camp list instead of N camp_pnl round-trips."""
    if not camps:
        return []
    ids = [c.id for c in camps]
    org_id = camps[0].org_id
    stmt = (
        select(
            Transaction.camp_id,
            Transaction.txn_type,
            Transaction.cost_nature,
            func.coalesce(func.sum(Transaction.net_amount), 0),
        )
        .where(
            Transaction.org_id == org_id,
            Transaction.status == "posted",
            Transaction.camp_id.in_(ids),
        )
        .group_by(Transaction.camp_id, Transaction.txn_type, Transaction.cost_nature)
    )
    buckets: dict[str, dict[str, Decimal]] = {i: {"rev": D0, "direct": D0, "alloc": D0} for i in ids}
    for camp_id, txn_type, nature, amt in db.execute(stmt):
        if camp_id not in buckets:
            continue
        val = D(amt)
        if txn_type == "revenue":
            buckets[camp_id]["rev"] += val
        elif txn_type == "refund":
            buckets[camp_id]["rev"] -= val
        elif txn_type == "cogs" or (txn_type in {"expense", "reimbursement"} and nature == "direct"):
            buckets[camp_id]["direct"] += val
        elif nature == "allocated":
            buckets[camp_id]["alloc"] += val
    return [_camp_row(c, buckets[c.id]) for c in camps]


def _camp_row(camp: Camp, b: dict[str, Decimal]) -> dict:
    rev, direct, allocated = b["rev"], b["direct"], b["alloc"]
    total_cost = direct + allocated
    contribution = rev - direct
    net = rev - total_cost
    attendees = camp.actual_attendees or 0
    inv = total_cost if total_cost > 0 else D(camp.budget)
    margin = float(pct(net, rev) or 0)
    flags = []
    if net < 0:
        flags.append("negative_profit")
    if rev > 0 and margin < 20:
        flags.append("low_margin")
    if camp.budget and total_cost > D(camp.budget):
        flags.append("overspend")
    return {
        "camp_id": camp.id,
        "name": camp.name,
        "status": camp.status,
        "financial_status": "loss" if net < 0 else ("thin" if (rev > 0 and margin < 20) else "healthy"),
        "city_id": camp.city_id,
        "client_id": camp.client_id,
        "channel": camp.channel,
        "date": camp.camp_date.isoformat(),
        "attendees": attendees,
        "budget": money(D(camp.budget)),
        "expected_revenue": money(D(camp.expected_revenue or 0)),
        "revenue": money(rev),
        "direct_cost": money(direct),
        "allocated_cost": money(allocated),
        "total_cost": money(total_cost),
        "contribution": money(contribution),
        "gross_profit": money(contribution),
        "net_profit": money(net),
        "margin": margin,
        "roi": float(pct(net, inv) or 0) if inv else 0,
        "flags": flags,
        "revenue_per_attendee": money(rev / attendees) if attendees else 0,
        "cost_per_attendee": money(total_cost / attendees) if attendees else 0,
        "profit_per_attendee": money(net / attendees) if attendees else 0,
    }


def package_unit_economics(db: Session, pkg: Package, selling_override: Decimal | None = None, cost_factor: Decimal | None = None, discount_pct: Decimal | None = None) -> dict:
    costs = {c.cost_type: D(c.amount) for c in pkg.costs}
    selling = D(selling_override if selling_override is not None else pkg.selling_price)
    if discount_pct:
        selling = D(selling * (1 - discount_pct / Decimal("100")))
    factor = cost_factor or Decimal("1")
    diagnostic = D(costs.get("diagnostic", D0) * factor)
    consultation = D(costs.get("consultation", D0) * factor)
    operations = D(costs.get("operations", D0) * factor)
    gateway = D(costs.get("gateway", D0) * factor)
    other = D(costs.get("other", D0) * factor)
    variable = diagnostic + consultation + operations + gateway + other
    contribution = selling - variable
    margin = pct(contribution, selling) or Decimal("0")
    # break-even volume against a notional monthly fixed allocation is not package-level;
    # break-even units where contribution covers zero fixed = 0; report contribution path
    return {
        "package_id": pkg.id,
        "name": pkg.name,
        "selling_price": money(selling),
        "diagnostic_cost": money(diagnostic),
        "consultation_cost": money(consultation),
        "operations": money(operations),
        "payment_gateway": money(gateway),
        "other_variable": money(other),
        "total_variable_cost": money(variable),
        "contribution_profit": money(contribution),
        "contribution_margin": float(margin),
        "profit_at_10": money(contribution * 10),
        "profit_at_50": money(contribution * 50),
        "profit_at_100": money(contribution * 100),
        "break_even_units": 0 if contribution > 0 else None,
    }


def package_actuals(db: Session, f: Filters, pkg: Package) -> dict:
    pf = Filters(**{**f.__dict__, "package_id": pkg.id})
    rev = net_revenue(db, pf)
    cost = direct_costs(db, pf)
    sold = db.execute(
        apply_dims(select(func.count()).select_from(Transaction), pf).where(Transaction.txn_type == "revenue")
    ).scalar() or 0
    gp = rev - cost
    return {
        **package_unit_economics(db, pkg),
        "units_sold": int(sold),
        "actual_revenue": money(rev),
        "actual_cost": money(cost),
        "actual_gross_profit": money(gp),
        "actual_margin": float(pct(gp, rev) or 0),
    }


def explore(db: Session, f: Filters, group_by: str, sort: str = "profit_desc") -> dict:
    rev = net_revenue(db, f)
    dc = direct_costs(db, f)
    contrib = rev - dc
    allocated = opex(db, f)
    net = contrib - allocated
    col_map = {
        "city": Transaction.city_id,
        "client": Transaction.client_id,
        "camp": Transaction.camp_id,
        "package": Transaction.package_id,
        "channel": Transaction.channel,
        "partner": Transaction.diagnostic_partner_id,
        "business_model": Transaction.business_model,
        "category": Transaction.category,
    }
    col = col_map.get(group_by, Transaction.city_id)
    rev_map = {r["key"]: r["amount"] for r in group_sum(db, f, ["revenue"], col)}
    # Direct costs only for segment contribution
    direct_map = {r["key"]: r["amount"] for r in group_sum(db, f, ["cogs"], col)}
    direct_exp = {
        r["key"]: r["amount"]
        for r in group_sum(db, f, ["expense", "reimbursement"], col)
    }
    # Prefer cost_nature=direct when present — approximate by adding cogs + camp-linked expense later
    cost_map = {k: Decimal(str(direct_map.get(k, 0))) + Decimal(str(direct_exp.get(k, 0))) for k in set(direct_map) | set(direct_exp)}
    # Transaction counts
    count_stmt = select(col, func.count(Transaction.id))
    count_stmt = apply_dims(count_stmt, f).group_by(col)
    count_map = {str(k) if k is not None else "unassigned": int(n) for k, n in db.execute(count_stmt).all()}

    keys = sorted(set(rev_map) | set(cost_map) | set(count_map))
    rows = []
    for k in keys:
        key = k if k not in {None, "", "None"} else "unassigned"
        r = Decimal(str(rev_map.get(k, rev_map.get(key, 0))))
        c = Decimal(str(cost_map.get(k, cost_map.get(key, 0))))
        p = r - c
        label = "Not assigned" if key in {"unassigned", "none", ""} else None
        rows.append({
            "key": key,
            "label": label,
            "revenue": float(r),
            "cost": float(c),
            "direct_cost": float(c),
            "gross_profit": float(p),
            "profit": float(p),
            "margin": float(pct(p, r) or 0),
            "allocated_opex": 0.0,
            "net_contribution": float(p),
            "txn_count": count_map.get(k, count_map.get(key, 0)),
        })

    if sort == "revenue_desc":
        rows.sort(key=lambda x: x["revenue"], reverse=True)
    elif sort == "margin_asc":
        rows.sort(key=lambda x: (x["margin"], x["revenue"]))
    elif sort == "loss_making":
        rows = [r for r in rows if r["profit"] < 0]
        rows.sort(key=lambda x: x["profit"])
    else:
        rows.sort(key=lambda x: x["profit"], reverse=True)

    return {
        "revenue": money(rev),
        "direct_costs": money(dc),
        "contribution": money(contrib),
        "contribution_margin": float(pct(contrib, rev) or 0),
        "allocated_operating_costs": money(allocated),
        "net_profit": money(net),
        "net_margin": float(pct(net, rev) or 0),
        "group_by": group_by,
        "sort": sort,
        "cost_note": "Segment rows show revenue and direct costs from the ledger. Company operating costs may be allocated separately and are shown in the summary above — not double-counted into every segment unless posted with that dimension.",
        "rows": rows,
    }


def budget_vs_actual(db: Session, f: Filters) -> list[dict]:
    if not f.date_from or not f.date_to:
        return []
    months: list[tuple[int, int]] = []
    cursor = f.date_from.replace(day=1)
    while cursor <= f.date_to:
        months.append((cursor.year, cursor.month))
        cursor = date(cursor.year + 1, 1, 1) if cursor.month == 12 else date(cursor.year, cursor.month + 1, 1)
    month_match = or_(*[and_(Budget.year == y, Budget.month == m) for y, m in months]) if months else False
    stmt = select(Budget.category, func.sum(Budget.amount)).where(Budget.org_id == f.org_id, month_match)
    rows = db.execute(stmt.group_by(Budget.category)).all()
    actuals = {r["key"]: r["amount"] for r in group_sum(db, f, ["expense", "cogs", "payroll", "reimbursement", "revenue"], Transaction.category)}
    out = []
    for cat, amt in rows:
        budget = D(amt)
        actual = D(actuals.get(cat or "", 0))
        var = actual - budget
        out.append({
            "category": cat,
            "budget": money(budget),
            "actual": money(actual),
            "variance": money(var),
            "variance_pct": float(pct(var, budget) or 0),
        })
    return out


def aging(db: Session, org_id: str, as_of: date) -> dict:
    invoices = db.scalars(
        select(Invoice).where(
            Invoice.org_id == org_id,
            Invoice.status.in_(["sent", "viewed", "partially_paid", "overdue"]),
        )
    ).all()
    buckets = {"current": D0, "1_30": D0, "31_60": D0, "61_90": D0, "90_plus": D0}
    details = []
    for inv in invoices:
        outstanding = D(inv.total) - D(inv.amount_paid)
        if outstanding <= 0:
            continue
        days = (as_of - inv.due_date).days
        if days <= 0:
            key = "current"
        elif days <= 30:
            key = "1_30"
        elif days <= 60:
            key = "31_60"
        elif days <= 90:
            key = "61_90"
        else:
            key = "90_plus"
        buckets[key] += outstanding
        details.append({
            "invoice_id": inv.id,
            "number": inv.number,
            "client_id": inv.client_id,
            "due_date": inv.due_date.isoformat(),
            "days_overdue": max(0, days),
            "outstanding": money(outstanding),
        })
    return {
        "total": money(sum(buckets.values(), D0)),
        "buckets": {k: money(v) for k, v in buckets.items()},
        "invoices": details,
    }


def expense_breakdown(db: Session, f: Filters) -> dict:
    month_expr = func.strftime("%Y-%m", Transaction.txn_date)
    if db.bind and db.bind.dialect.name == "postgresql":
        month_expr = func.to_char(Transaction.txn_date, "YYYY-MM")
    cost_types = ["expense", "cogs", "payroll", "reimbursement"]
    stmt = select(
        Transaction.txn_type,
        Transaction.category,
        Transaction.subcategory,
        Transaction.camp_id,
        Transaction.employee_id,
        month_expr.label("month"),
        func.coalesce(func.sum(Transaction.net_amount), 0),
    )
    stmt = apply_dims(stmt, f).where(Transaction.txn_type.in_(cost_types)).group_by(
        Transaction.txn_type, Transaction.category, Transaction.subcategory,
        Transaction.camp_id, Transaction.employee_id, month_expr,
    )
    rows = db.execute(stmt).all()

    buckets = {"fixed": 0.0, "salary": 0.0, "subscription": 0.0, "reimbursement": 0.0, "camp": 0.0, "other": 0.0}
    by_month: dict[str, float] = {}
    by_quarter: dict[str, float] = {}
    by_year: dict[str, float] = {}
    by_camp: dict[str, float] = {}
    by_category: dict[str, float] = {}
    for txn_type, category, subcategory, camp_id, _emp, month, total in rows:
        amt = money(D(total))
        bucket = expense_bucket(txn_type, category, subcategory, camp_id)
        buckets[bucket] = buckets.get(bucket, 0) + amt
        if month:
            by_month[month] = by_month.get(month, 0) + amt
            year = month[:4]
            by_year[year] = by_year.get(year, 0) + amt
            q = (int(month[5:7]) - 1) // 3 + 1
            qk = f"{year} Q{q}"
            by_quarter[qk] = by_quarter.get(qk, 0) + amt
        cat = subcategory or category or "other"
        by_category[cat] = by_category.get(cat, 0) + amt
        if camp_id:
            by_camp[camp_id] = by_camp.get(camp_id, 0) + amt

    camp_names = {c.id: c.name for c in db.scalars(select(Camp).where(Camp.org_id == f.org_id)).all()} if by_camp else {}
    emp_names = {e.id: e.name for e in db.scalars(select(Employee).where(Employee.org_id == f.org_id)).all()}

    salary_stmt = select(SalaryRecord.employee_id, func.coalesce(func.sum(SalaryRecord.gross), 0)).where(SalaryRecord.org_id == f.org_id)
    if f.date_from:
        salary_stmt = salary_stmt.where(
            or_(
                SalaryRecord.period_year > f.date_from.year,
                and_(SalaryRecord.period_year == f.date_from.year, SalaryRecord.period_month >= f.date_from.month),
            )
        )
    if f.date_to:
        salary_stmt = salary_stmt.where(
            or_(
                SalaryRecord.period_year < f.date_to.year,
                and_(SalaryRecord.period_year == f.date_to.year, SalaryRecord.period_month <= f.date_to.month),
            )
        )
    salary_rows = db.execute(salary_stmt.group_by(SalaryRecord.employee_id)).all()

    reimb_stmt = select(
        Reimbursement.employee_id,
        Reimbursement.kind,
        Reimbursement.status,
        func.coalesce(func.sum(Reimbursement.amount), 0),
    ).where(Reimbursement.org_id == f.org_id)
    if f.date_from:
        reimb_stmt = reimb_stmt.where(Reimbursement.claim_date >= f.date_from)
    if f.date_to:
        reimb_stmt = reimb_stmt.where(Reimbursement.claim_date <= f.date_to)
    reimb_rows = db.execute(reimb_stmt.group_by(Reimbursement.employee_id, Reimbursement.kind, Reimbursement.status)).all()
    reimb_by_emp: dict[str, dict] = {}
    for emp_id, kind, status, total in reimb_rows:
        row = reimb_by_emp.setdefault(
            emp_id,
            {
                "employee_id": emp_id,
                "employee": emp_names.get(emp_id, "Staff"),
                "monthly": 0.0,
                "camp": 0.0,
                "total": 0.0,
                "claimed": 0.0,
                "approved": 0.0,
                "paid": 0.0,
                "pending": 0.0,
                "rejected": 0.0,
            },
        )
        amt = money(D(total))
        key = "camp" if kind == "camp" else "monthly"
        row[key] += amt
        row["total"] += amt
        row["claimed"] += amt
        st = (status or "submitted").lower()
        if st == "paid":
            row["paid"] += amt
        elif st == "approved":
            row["approved"] += amt
            row["pending"] += amt  # approved-but-unpaid sits in pending for payment
        elif st == "rejected":
            row["rejected"] += amt
        else:
            row["pending"] += amt

    sub_stmt = select(Expense).where(
        Expense.org_id == f.org_id,
        Expense.approval_status != "rejected",
    )
    if f.date_from:
        sub_stmt = sub_stmt.where(Expense.expense_date >= f.date_from)
    if f.date_to:
        sub_stmt = sub_stmt.where(Expense.expense_date <= f.date_to)
    subscriptions = []
    for e in db.scalars(sub_stmt.order_by(Expense.expense_date.desc())).all():
        if expense_bucket("expense", e.category, e.subcategory, None) != "subscription" or e.camp_id:
            continue
        tool = (e.subcategory or e.category or "software").lower()
        subscriptions.append({
            "id": e.id, "date": e.expense_date.isoformat(), "tool": tool,
            "description": e.description, "amount": float(e.amount), "status": e.approval_status,
        })

    total = sum(buckets.values())
    return {
        "total": round(total, 2),
        "buckets": {k: round(v, 2) for k, v in buckets.items()},
        "by_month": [{"key": k, "amount": round(v, 2)} for k, v in sorted(by_month.items())],
        "by_quarter": [{"key": k, "amount": round(v, 2)} for k, v in sorted(by_quarter.items())],
        "by_year": [{"key": k, "amount": round(v, 2)} for k, v in sorted(by_year.items())],
        "by_camp": [{"key": k, "label": camp_names.get(k, k), "amount": round(v, 2)} for k, v in sorted(by_camp.items(), key=lambda x: -x[1])],
        "by_category": [{"key": k, "amount": round(v, 2)} for k, v in sorted(by_category.items(), key=lambda x: -x[1])],
        "salary_by_employee": [
            {"id": eid, "employee_id": eid, "employee": emp_names.get(eid, "Staff"), "amount": money(D(amt))}
            for eid, amt in salary_rows
        ],
        "reimbursements_by_employee": sorted(
            [{**r, "id": r["employee_id"]} for r in reimb_by_emp.values()],
            key=lambda x: -x["total"],
        ),
        "subscriptions": subscriptions,
    }


def account_balances(db: Session, f: Filters) -> list[dict]:
    """Debit − credit per account from posted journals up to date_to (and from date_from if set)."""
    from app.models import JournalEntry

    names = {a.code: (a.name, a.type) for a in db.scalars(select(Account).where(Account.org_id == f.org_id)).all()}
    stmt = (
        select(
            JournalLine.account_code,
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .select_from(JournalLine)
        .join(JournalLine.entry)
        .where(JournalEntry.org_id == f.org_id, JournalEntry.status == "posted")
        .group_by(JournalLine.account_code)
    )
    if f.date_from:
        stmt = stmt.where(JournalEntry.entry_date >= f.date_from)
    if f.date_to:
        stmt = stmt.where(JournalEntry.entry_date <= f.date_to)
    rows = []
    for code, debit, credit in db.execute(stmt).all():
        name, typ = names.get(code, (code, "unknown"))
        d, c = D(debit), D(credit)
        rows.append({
            "code": code,
            "name": name,
            "type": typ,
            "debit": money(d),
            "credit": money(c),
            "balance": money(d - c),
        })
    return sorted(rows, key=lambda r: r["code"])


def trial_balance(db: Session, f: Filters) -> dict:
    rows = account_balances(db, f)
    total_dr = sum(r["debit"] for r in rows)
    total_cr = sum(r["credit"] for r in rows)
    return {
        "rows": rows,
        "total_debit": round(total_dr, 2),
        "total_credit": round(total_cr, 2),
        "balanced": abs(total_dr - total_cr) < 0.02,
        "disclaimer": "Management working trial balance from posted journals — validate before statutory filing.",
    }


def balance_sheet(db: Session, f: Filters) -> dict:
    """Point-in-time BS from cumulative journal balances through date_to."""
    as_of = Filters(org_id=f.org_id, date_to=f.date_to or date.today())
    rows = account_balances(db, as_of)
    assets, liabilities, equity = [], [], []
    for r in rows:
        if r["type"] == "asset":
            assets.append({**r, "amount": r["balance"]})
        elif r["type"] == "liability":
            # Credit-normal: present obligation as credit − debit
            liabilities.append({**r, "amount": money(D(str(r["credit"])) - D(str(r["debit"])))})
        elif r["type"] == "equity":
            equity.append({**r, "amount": money(D(str(r["credit"])) - D(str(r["debit"])))})
        # P&L accounts rolled into current-period equity below
    net = D(str(pnl(db, as_of)["net_profit"]))
    equity.append({"code": "NP", "name": "Current period net profit", "type": "equity", "amount": money(net)})
    total_assets = sum(a["amount"] for a in assets)
    total_liab = sum(l["amount"] for l in liabilities)
    total_eq = sum(e["amount"] for e in equity)
    return {
        "as_of": (f.date_to or date.today()).isoformat(),
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "total_assets": round(total_assets, 2),
        "total_liabilities": round(total_liab, 2),
        "total_equity": round(total_eq, 2),
        "disclaimer": "Management balance sheet from COA journals — not a statutory audited statement.",
    }


def general_ledger(db: Session, f: Filters, account_code: str | None = None, limit: int = 1000) -> dict:
    from app.models import JournalEntry

    stmt = (
        select(
            JournalEntry.entry_date,
            JournalEntry.memo,
            JournalEntry.source_transaction_id,
            JournalLine.account_code,
            JournalLine.debit,
            JournalLine.credit,
            JournalEntry.id,
        )
        .select_from(JournalLine)
        .join(JournalLine.entry)
        .where(JournalEntry.org_id == f.org_id, JournalEntry.status == "posted")
        .order_by(JournalEntry.entry_date, JournalEntry.id)
        .limit(limit)
    )
    if f.date_from:
        stmt = stmt.where(JournalEntry.entry_date >= f.date_from)
    if f.date_to:
        stmt = stmt.where(JournalEntry.entry_date <= f.date_to)
    if account_code:
        stmt = stmt.where(JournalLine.account_code == account_code)
    names = {a.code: a.name for a in db.scalars(select(Account).where(Account.org_id == f.org_id)).all()}
    items = []
    for entry_date, memo, src, code, debit, credit, eid in db.execute(stmt).all():
        items.append({
            "id": f"{eid}-{code}",
            "date": entry_date.isoformat(),
            "account_code": code,
            "account_name": names.get(code, code),
            "memo": memo,
            "transaction_id": src,
            "debit": money(D(debit)),
            "credit": money(D(credit)),
        })
    return {"items": items, "disclaimer": "Posted journal lines only."}


def gst_summary(db: Session, f: Filters) -> dict:
    from app.models import JournalEntry

    def _bal(code: str) -> Decimal:
        stmt = (
            select(
                func.coalesce(func.sum(JournalLine.debit), 0),
                func.coalesce(func.sum(JournalLine.credit), 0),
            )
            .select_from(JournalLine)
            .join(JournalLine.entry)
            .where(
                JournalEntry.org_id == f.org_id,
                JournalEntry.status == "posted",
                JournalLine.account_code == code,
            )
        )
        if f.date_from:
            stmt = stmt.where(JournalEntry.entry_date >= f.date_from)
        if f.date_to:
            stmt = stmt.where(JournalEntry.entry_date <= f.date_to)
        d, c = db.execute(stmt).one()
        return D(d), D(c)

    in_dr, in_cr = _bal("1210")
    out_dr, out_cr = _bal("2200")
    input_gst = in_dr - in_cr
    output_gst = out_cr - out_dr
    taxable = net_revenue(db, f)
    return {
        "taxable_sales": money(taxable),
        "output_gst": money(output_gst),
        "input_gst": money(input_gst),
        "net_gst_payable": money(output_gst - input_gst),
        "disclaimer": "Derived from GST journal accounts 1210/2200 — reconcile before filing.",
    }


def revenue_ledger(db: Session, f: Filters) -> dict:
    return {
        "by_channel": group_sum(db, f, ["revenue"], Transaction.channel),
        "by_client": group_sum(db, f, ["revenue"], Transaction.client_id),
        "by_package": group_sum(db, f, ["revenue"], Transaction.package_id),
        "by_category": group_sum(db, f, ["revenue"], Transaction.category),
        "total": money(net_revenue(db, f)),
    }


def expense_ledger(db: Session, f: Filters) -> dict:
    types = ["expense", "cogs", "payroll", "reimbursement"]
    return {
        "by_category": group_sum(db, f, types, Transaction.category),
        "by_vendor": group_sum(db, f, types, Transaction.vendor_id),
        "by_partner": group_sum(db, f, types, Transaction.diagnostic_partner_id),
        "by_employee": group_sum(db, f, types, Transaction.employee_id),
        "total": money(direct_costs(db, f) + opex(db, f)),
    }


def partner_cost_report(db: Session, f: Filters) -> list[dict]:
    partners = db.scalars(select(DiagnosticPartner).where(DiagnosticPartner.org_id == f.org_id)).all()
    out = []
    for p in partners:
        pf = Filters(
            org_id=f.org_id, date_from=f.date_from, date_to=f.date_to,
            diagnostic_partner_id=p.id,
        )
        cost = _sum(db, pf, ["cogs", "expense"])
        rev = _sum(db, pf, ["revenue"])
        out.append({
            "id": p.id,
            "name": p.name,
            "cost": money(cost),
            "revenue": money(rev),
            "contribution": money(rev - cost),
        })
    return sorted(out, key=lambda x: -x["cost"])


def rich_attention(db: Session, org_id: str, f: Filters | None = None) -> list[dict]:
    f = f or Filters(org_id=org_id)
    items = []
    ar = aging(db, org_id, date.today())
    overdue = ar["buckets"]["61_90"] + ar["buckets"]["90_plus"]
    if overdue > 0:
        items.append({"kind": "overdue_invoices", "text": f"₹{overdue:,.0f} invoices overdue >60 days", "to": "/invoices"})
    ap = payables(db, f)
    if ap > 0:
        items.append({"kind": "vendor_payables", "text": f"₹{money(ap):,.0f} vendor/partner bills unpaid", "to": "/invoices"})
    pending = db.scalar(
        select(func.count()).select_from(Expense).where(
            Expense.org_id == org_id, Expense.approval_status == "submitted"
        )
    ) or 0
    if pending:
        items.append({"kind": "unapproved_expenses", "text": f"{pending} expenses awaiting approval", "to": "/expenses"})
    camps = db.scalars(select(Camp).where(Camp.org_id == org_id)).all()
    losses = [c for c in (camp_pnl(db, c) for c in camps) if c["net_profit"] < 0][:3]
    for c in losses:
        items.append({"kind": "loss_camp", "text": f"{c['name']} is loss-making (₹{c['net_profit']:,.0f})", "to": f"/camps/{c['camp_id']}"})
    explain = cash_explanation(db, f)
    if explain["needs_attention"]:
        reason = explain["reasons"][0] if explain["reasons"] else "Cash position needs review"
        items.append({"kind": "cash", "text": reason, "to": "/pnl"})
    return items
