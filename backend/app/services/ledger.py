from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AccountingPeriod, AuditLog, JournalEntry, JournalLine, Transaction, uid

D0 = Decimal("0.00")


class LedgerError(Exception):
    pass


def ensure_period_open(db: Session, org_id: str, txn_date: date) -> None:
    period = db.scalar(
        select(AccountingPeriod).where(
            AccountingPeriod.org_id == org_id,
            AccountingPeriod.year == txn_date.year,
            AccountingPeriod.month == txn_date.month,
        )
    )
    if period and period.status == "locked":
        raise LedgerError(f"{txn_date.strftime('%B %Y')} is locked. Ask a finance admin to reopen it.")


def audit(db: Session, org_id: str, user_id: str | None, action: str, entity_type: str, entity_id: str, before: str | None = None, after: str | None = None, reason: str | None = None) -> None:
    db.add(AuditLog(
        org_id=org_id, user_id=user_id, action=action,
        entity_type=entity_type, entity_id=entity_id,
        before=before, after=after, reason=reason,
    ))


def post_transaction(
    db: Session,
    *,
    org_id: str,
    user_id: str | None,
    txn_date: date,
    txn_type: str,
    amount: Decimal,
    account_code: str,
    contra_code: str,
    tax_amount: Decimal = D0,
    discount_amount: Decimal = D0,
    net_amount: Decimal | None = None,
    description: str | None = None,
    reference: str | None = None,
    payment_status: str = "unpaid",
    payment_method: str | None = None,
    category: str | None = None,
    subcategory: str | None = None,
    cost_nature: str | None = None,
    dimensions: dict[str, Any] | None = None,
    debit_account: str | None = None,
    credit_account: str | None = None,
) -> Transaction:
    ensure_period_open(db, org_id, txn_date)
    net = net_amount if net_amount is not None else (amount - discount_amount)
    dims = dimensions or {}

    txn = Transaction(
        org_id=org_id,
        txn_date=txn_date,
        txn_type=txn_type,
        amount=amount,
        tax_amount=tax_amount,
        discount_amount=discount_amount,
        net_amount=net,
        payment_status=payment_status,
        payment_method=payment_method,
        account_code=account_code,
        category=category,
        subcategory=subcategory,
        cost_nature=cost_nature,
        description=description,
        reference=reference,
        camp_id=dims.get("camp_id"),
        city_id=dims.get("city_id"),
        client_id=dims.get("client_id"),
        customer_id=dims.get("customer_id"),
        package_id=dims.get("package_id"),
        diagnostic_partner_id=dims.get("diagnostic_partner_id"),
        vendor_id=dims.get("vendor_id"),
        employee_id=dims.get("employee_id"),
        channel=dims.get("channel"),
        business_model=dims.get("business_model"),
        source=dims.get("source"),
        invoice_id=dims.get("invoice_id"),
        expense_id=dims.get("expense_id"),
        status="posted",
        created_by=user_id,
        approved_by=user_id,
    )
    db.add(txn)
    db.flush()

    # Default double-entry: revenue credits the P&L account; costs debit it.
    dr = debit_account
    cr = credit_account
    if dr is None or cr is None:
        if txn_type in {"revenue"}:
            dr, cr = contra_code, account_code  # AR/Cash DR, Revenue CR
        elif txn_type in {"cogs", "expense", "payroll", "reimbursement"}:
            dr, cr = account_code, contra_code  # Expense DR, AP/Cash CR
        elif txn_type == "payment_in":
            dr, cr = account_code, contra_code  # Cash DR, AR CR
        elif txn_type == "payment_out":
            dr, cr = contra_code, account_code  # AP DR, Cash CR
        elif txn_type == "refund":
            dr, cr = account_code, contra_code
        else:
            dr, cr = account_code, contra_code

    total = net + tax_amount
    if total <= 0:
        raise LedgerError("Posted amount must be greater than zero.")

    entry = JournalEntry(
        org_id=org_id,
        entry_date=txn_date,
        memo=description,
        source_transaction_id=txn.id,
        status="posted",
        created_by=user_id,
    )
    # GST is a balance-sheet tax line — never mix it into P&L accounts.
    if tax_amount > 0 and txn_type == "revenue":
        entry.lines = [
            JournalLine(account_code=dr, debit=total, credit=D0),
            JournalLine(account_code=cr, debit=D0, credit=net),
            JournalLine(account_code="2200", debit=D0, credit=tax_amount),
        ]
    elif tax_amount > 0 and txn_type in {"cogs", "expense", "payroll", "reimbursement"}:
        entry.lines = [
            JournalLine(account_code=dr, debit=net, credit=D0),
            JournalLine(account_code="1210", debit=tax_amount, credit=D0),
            JournalLine(account_code=cr, debit=D0, credit=total),
        ]
    else:
        entry.lines = [
            JournalLine(account_code=dr, debit=total, credit=D0),
            JournalLine(account_code=cr, debit=D0, credit=total),
        ]
    db.add(entry)
    audit(db, org_id, user_id, "post_transaction", "transaction", txn.id, after=str(net))
    return txn


def void_transaction(db: Session, txn: Transaction, user_id: str | None, reason: str) -> None:
    ensure_period_open(db, txn.org_id, txn.txn_date)
    if txn.status == "void":
        raise LedgerError("Transaction is already void.")
    before = str(txn.net_amount)
    txn.status = "void"
    entry = db.scalar(select(JournalEntry).where(JournalEntry.source_transaction_id == txn.id))
    if entry:
        entry.status = "void"
    audit(db, txn.org_id, user_id, "void_transaction", "transaction", txn.id, before=before, reason=reason)


# Chart of accounts used by posting helpers
COA = [
    ("1000", "Cash", "asset", True),
    ("1010", "Bank", "asset", True),
    ("1100", "Accounts Receivable", "asset", False),
    ("1200", "Prepaid Expenses", "asset", False),
    ("1210", "GST Input Credit", "asset", False),
    ("1300", "Security Deposits", "asset", False),
    ("1500", "Fixed Assets", "asset", False),
    ("2000", "Accounts Payable", "liability", False),
    ("2100", "Employee Payables", "liability", False),
    ("2200", "GST Payable", "liability", False),
    ("2300", "Other Tax Payables", "liability", False),
    ("2400", "Deferred Revenue", "liability", False),
    ("3000", "Founder Capital", "equity", False),
    ("3100", "Share Capital", "equity", False),
    ("3200", "Retained Earnings", "equity", False),
    ("4000", "B2B Camp Revenue", "revenue", False),
    ("4010", "B2C Revenue", "revenue", False),
    ("4020", "App Revenue", "revenue", False),
    ("4030", "Package Revenue", "revenue", False),
    ("4040", "Consultation Revenue", "revenue", False),
    ("4050", "Diagnostic Revenue", "revenue", False),
    ("4090", "Other Revenue", "revenue", False),
    ("5000", "Diagnostic Partner Cost", "cogs", False),
    ("5010", "Lab Test Cost", "cogs", False),
    ("5020", "Camp Medical Cost", "cogs", False),
    ("5030", "Camp Staffing Cost", "cogs", False),
    ("5040", "Camp Logistics", "cogs", False),
    ("5050", "Consumables", "cogs", False),
    ("5060", "Payment Gateway Charges", "cogs", False),
    ("6000", "Salaries", "opex", False),
    ("6010", "Employee Reimbursements", "opex", False),
    ("6020", "Rent", "opex", False),
    ("6030", "Software", "opex", False),
    ("6040", "Marketing", "opex", False),
    ("6050", "Travel", "opex", False),
    ("6060", "Professional Fees", "opex", False),
    ("6070", "Legal", "opex", False),
    ("6080", "Accounting", "opex", False),
    ("6090", "Technology", "opex", False),
    ("6100", "Office Expenses", "opex", False),
    ("6110", "Communication", "opex", False),
    ("6120", "Insurance", "opex", False),
    ("6900", "Miscellaneous", "opex", False),
]

CATEGORY_ACCOUNT = {
    "diagnostic": "5000",
    "lab": "5010",
    "medical": "5020",
    "staffing": "5030",
    "logistics": "5040",
    "consumables": "5050",
    "gateway": "5060",
    "salaries": "6000",
    "reimbursements": "6010",
    "rent": "6020",
    "software": "6030",
    "marketing": "6040",
    "travel": "6050",
    "professional": "6060",
    "legal": "6070",
    "accounting": "6080",
    "technology": "6090",
    "office": "6100",
    "communication": "6110",
    "insurance": "6120",
    "venue": "5040",
    "food": "5040",
    "stay": "5040",
    "phlebotomist": "5030",
    "doctors": "5020",
    "nutritionists": "5020",
    "monthly": "6010",
    "phone": "6110",
    "internet": "6110",
    "goodie_bags": "5050",
    "marketing_materials": "5040",
    "lab_partners": "5000",
    "cursor": "6030",
    "claude": "6030",
    "figma": "6030",
}

CAMP_EXPENSE_CATS = (
    "travel", "food", "stay", "goodie_bags", "marketing_materials",
    "logistics", "lab_partners", "doctors", "nutritionists", "miscellaneous",
    "venue", "diagnostic", "phlebotomist", "staffing", "medical", "lab",
)
FIXED_EXPENSE_CATS = ("rent", "insurance", "office", "communication", "accounting", "legal")
SUBSCRIPTION_CATS = ("software", "cursor", "claude", "figma", "technology")
SUBSCRIPTION_TOOLS = ("cursor", "claude", "figma")


def expense_bucket(txn_type: str | None, category: str | None, subcategory: str | None, camp_id: str | None) -> str:
    cat = (category or "").lower()
    sub = (subcategory or "").lower()
    if txn_type == "payroll" or cat == "salaries":
        return "salary"
    if txn_type == "reimbursement" or cat in {"reimbursements", "monthly"}:
        return "reimbursement"
    if sub in SUBSCRIPTION_TOOLS or cat in SUBSCRIPTION_TOOLS or cat in SUBSCRIPTION_CATS:
        return "subscription"
    if camp_id or cat in CAMP_EXPENSE_CATS:
        return "camp"
    if cat in FIXED_EXPENSE_CATS:
        return "fixed"
    return "other"

REVENUE_ACCOUNT = {
    "b2b": "4000",
    "camp": "4000",
    "b2c": "4010",
    "app": "4020",
    "package": "4030",
    "consultation": "4040",
    "diagnostic": "4050",
    "other": "4090",
}
