from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.deps import current_user
from app.models import Camp, City, Client, DiagnosticPartner, Package, Transaction, User
from app.api.filters import qfilters
from app.services import finance as F
from app.services.finance import Filters

router = APIRouter(tags=["analytics"])


@router.get("/dashboard/executive")
def executive(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    kpis = F.executive_kpis(db, f)
    return {
        **kpis,
        "charts": {
            "monthly_revenue": F.monthly_series(db, f, ["revenue"]),
            "monthly_expense": F.monthly_series(db, f, ["expense", "cogs", "payroll", "reimbursement"]),
            "by_channel": F.group_sum(db, f, ["revenue"], Transaction.channel),
            "by_city": _named(db, F.group_sum(db, f, ["revenue"], Transaction.city_id), City, user.org_id),
            "by_client": _named(db, F.group_sum(db, f, ["revenue"], Transaction.client_id), Client, user.org_id),
            "by_package": _named(db, F.group_sum(db, f, ["revenue"], Transaction.package_id), Package, user.org_id),
            "by_model": F.group_sum(db, f, ["revenue"], Transaction.business_model),
            "expense_categories": F.group_sum(db, f, ["expense", "cogs", "payroll", "reimbursement"], Transaction.category),
        },
        "attention": F.rich_attention(db, user.org_id, f),
    }


@router.get("/dashboard/investor")
def investor(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    kpis = F.executive_kpis(db, f)
    pnl = F.pnl(db, f)
    return {
        "kpis": {
            "revenue": kpis["revenue"],
            "gross_margin": kpis["gross_margin"],
            "ebitda": kpis["ebitda"],
            "net_profit": kpis["net_profit"],
            "cash_balance": kpis["cash_balance"],
            "burn_rate": kpis["burn_rate"],
            "runway_months": kpis["runway_months"],
        },
        "mix": {
            "channel": F.group_sum(db, f, ["revenue"], Transaction.channel),
            "model": F.group_sum(db, f, ["revenue"], Transaction.business_model),
            "city": _named(db, F.group_sum(db, f, ["revenue"], Transaction.city_id), City, user.org_id),
        },
        "monthly_revenue": F.monthly_series(db, f, ["revenue"]),
        "pnl": pnl,
        "unit_economics": _top_packages(db, f),
    }


@router.get("/profitability")
def profitability(
    group_by: str = Query("city"),
    sort: str = Query("profit_desc"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    f: Filters = Depends(qfilters),
):
    data = F.explore(db, f, group_by, sort=sort)
    data["rows"] = _hydrate_keys(db, user.org_id, group_by, data["rows"])
    for row in data["rows"]:
        if row.get("key") in {"unassigned", "none", ""} or not row.get("name"):
            row["name"] = row.get("label") or "Not assigned"
            row["label"] = "Not assigned"
    return data


@router.get("/transactions")
def list_transactions(
    tab: str = Query("all"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    f: Filters = Depends(qfilters),
):
    return F.list_ledger_transactions(db, f, tab=tab)


@router.get("/reports/pnl")
def report_pnl(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return F.pnl(db, f)


@router.get("/reports/expenses")
def report_expenses(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return F.expense_breakdown(db, f)


@router.get("/reports/cashflow")
def report_cf(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return F.cashflow(db, f)


@router.get("/reports/budgets")
def report_budget(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return F.budget_vs_actual(db, f)


@router.get("/reports/receivables")
def report_ar(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return F.aging(db, user.org_id, date.today())


@router.get("/reports/payables")
def report_ap(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return {"total": float(F.payables(db, f)), "items": F.drill_transactions(db, f, "payables")["items"]}


@router.get("/reports/transactions")
def report_txn_drill(
    metric: str = Query("all"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    f: Filters = Depends(qfilters),
):
    return F.drill_transactions(db, f, metric)


@router.get("/reports/trial-balance")
def report_tb(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return F.trial_balance(db, f)


@router.get("/reports/balance-sheet")
def report_bs(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return F.balance_sheet(db, f)


@router.get("/reports/general-ledger")
def report_gl(
    account_code: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    f: Filters = Depends(qfilters),
):
    return F.general_ledger(db, f, account_code=account_code)


@router.get("/reports/gst")
def report_gst(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return F.gst_summary(db, f)


@router.get("/reports/revenue-ledger")
def report_rev_ledger(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    data = F.revenue_ledger(db, f)
    data["by_client"] = _named(db, data["by_client"], Client, user.org_id)
    data["by_package"] = _named(db, data["by_package"], Package, user.org_id)
    return data


@router.get("/reports/expense-ledger")
def report_exp_ledger(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return F.expense_ledger(db, f)


@router.get("/reports/camp-profitability")
def report_camp_profit(db: Session = Depends(get_db), user: User = Depends(current_user)):
    camps = db.scalars(select(Camp).where(Camp.org_id == user.org_id).options(joinedload(Camp.client), joinedload(Camp.city))).unique().all()
    pnls = {r["camp_id"]: r for r in F.camps_with_pnl(db, list(camps))}
    items = [
        {
            **pnls[c.id],
            "client": c.client.name if c.client else None,
            "city": c.city.name if c.city else None,
        }
        for c in camps
        if c.id in pnls
    ]
    return {"items": items, "disclaimer": "Camp P&L from camp-linked posted transactions."}


@router.get("/reports/partners")
def report_partners(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return {"items": F.partner_cost_report(db, f)}


@router.get("/reports/cash-explanation")
def report_cash_explain(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    return F.cash_explanation(db, f)


@router.get("/insights")
def insights(db: Session = Depends(get_db), user: User = Depends(current_user), f: Filters = Depends(qfilters)):
    kpis = F.executive_kpis(db, f)
    pnl = F.pnl(db, f)
    ar = F.aging(db, user.org_id, date.today())
    camps = db.scalars(select(Camp).where(Camp.org_id == user.org_id)).all()
    camp_pnls = sorted((F.camp_pnl(db, c) for c in camps), key=lambda x: x["net_profit"])
    worst = camp_pnls[0] if camp_pnls else None
    best = camp_pnls[-1] if camp_pnls else None
    items = []
    if kpis["revenue"]["change_pct"] is not None:
        items.append({
            "title": "Revenue movement",
            "body": f"Net revenue is ₹{_inr(kpis['revenue']['value'])} this period, {kpis['revenue']['change_pct']}% vs the previous window.",
            "basis": "SUM(posted revenue transactions) − refunds, compared to an equal-length prior period.",
        })
    items.append({
        "title": "Margin",
        "body": f"Gross margin is {pnl['gross_margin']}% (gross profit ₹{_inr(pnl['gross_profit'])} on net revenue ₹{_inr(pnl['total_revenue'])}). OpEx ₹{_inr(pnl['total_opex'])} → EBITDA ₹{_inr(pnl['ebitda'])}.",
        "basis": "Gross profit = net revenue − direct costs. EBITDA = gross profit − indirect opex.",
    })
    overdue = ar["buckets"]["61_90"] + ar["buckets"]["90_plus"]
    items.append({
        "title": "Receivables risk",
        "body": f"₹{_inr(ar['total'])} outstanding. ₹{_inr(overdue)} is overdue beyond 60 days.",
        "basis": "Invoice total − amount paid, bucketed by days past due date.",
    })
    if best and worst:
        items.append({
            "title": "Camp spread",
            "body": f"{best['name']} is the most profitable (₹{_inr(best['net_profit'])}, ROI {best['roi']}%). {worst['name']} is weakest at ₹{_inr(worst['net_profit'])}.",
            "basis": "Camp net profit = camp-linked revenue − direct − allocated costs.",
        })
    explain = kpis.get("cash_explanation") or {}
    if explain.get("needs_attention"):
        items.append({
            "title": "Cash position",
            "body": " ".join(explain.get("reasons") or ["Review cash and burn."]),
            "basis": "Journal cash/bank balances and average monthly cash credits.",
        })
    return {"insights": items}


def _inr(v: float) -> str:
    return f"{v:,.0f}"


def _named(db: Session, rows: list[dict], model, org_id: str) -> list[dict]:
    ids = [r["key"] for r in rows if r["key"] != "unassigned"]
    if not ids:
        return rows
    found = {x.id: x.name for x in db.scalars(select(model).where(model.id.in_(ids))).all()}
    return [{**r, "label": found.get(r["key"], r["key"])} for r in rows]


def _hydrate_keys(db: Session, org_id: str, group_by: str, rows: list[dict]) -> list[dict]:
    model = {"city": City, "client": Client, "camp": Camp, "package": Package, "partner": DiagnosticPartner}.get(group_by)
    if not model:
        return [{**r, "label": r["key"]} for r in rows]
    return _named(db, rows, model, org_id)


def _top_packages(db: Session, f: Filters) -> list[dict]:
    pkgs = db.scalars(select(Package).where(Package.org_id == f.org_id).options(joinedload(Package.costs))).unique().all()
    return [F.package_actuals(db, f, p) for p in pkgs][:8]
