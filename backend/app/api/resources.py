from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.deps import current_user, require
from app.models import (
    Camp,
    City,
    Client,
    Clinician,
    DiagnosticPartner,
    Employee,
    Expense,
    Invoice,
    Package,
    PackageCost,
    PartnerPrice,
    Reimbursement,
    User,
    Vendor,
)
from app.schemas import CampIn, CampTravellerIn, ClientIn, ClinicianIn, EmployeeIn, PackageIn, PartnerIn
from app.services.finance import Filters, camp_pnl, camps_with_pnl, package_actuals, package_unit_economics
from app.services.ledger import audit

router = APIRouter(tags=["resources"])


def _page(q, page: int, page_size: int):
    return q.offset((page - 1) * page_size).limit(page_size)


@router.get("/lookups")
def lookups(db: Session = Depends(get_db), user: User = Depends(current_user)):
    org = user.org_id
    return {
        "cities": [{"id": x.id, "name": x.name} for x in db.scalars(select(City).where(City.org_id == org))],
        "clients": [{"id": x.id, "name": x.name} for x in db.scalars(select(Client).where(Client.org_id == org))],
        "packages": [{"id": x.id, "name": x.name, "selling_price": float(x.selling_price)} for x in db.scalars(select(Package).where(Package.org_id == org))],
        "partners": [{"id": x.id, "name": x.name} for x in db.scalars(select(DiagnosticPartner).where(DiagnosticPartner.org_id == org))],
        "vendors": [{"id": x.id, "name": x.name} for x in db.scalars(select(Vendor).where(Vendor.org_id == org))],
        "employees": [{"id": x.id, "name": x.name} for x in db.scalars(select(Employee).where(Employee.org_id == org))],
        "camps": [{"id": x.id, "name": x.name} for x in db.scalars(select(Camp).where(Camp.org_id == org))],
        "clinicians": [{"id": x.id, "name": x.name, "kind": x.kind} for x in db.scalars(select(Clinician).where(Clinician.org_id == org))],
    }


@router.get("/search")
def search(q: str = Query(min_length=2), db: Session = Depends(get_db), user: User = Depends(current_user)):
    like = f"%{q}%"
    org = user.org_id
    results = []
    for model, kind, field in (
        (Client, "client", Client.name),
        (Camp, "camp", Camp.name),
        (Package, "package", Package.name),
        (DiagnosticPartner, "partner", DiagnosticPartner.name),
        (Vendor, "vendor", Vendor.name),
        (Employee, "employee", Employee.name),
        (Clinician, "clinician", Clinician.name),
    ):
        rows = db.scalars(select(model).where(model.org_id == org, func.lower(field).like(like.lower())).limit(5)).all()
        for r in rows:
            results.append({"kind": kind, "id": r.id, "label": r.name})
    invoices = db.scalars(select(Invoice).where(Invoice.org_id == org, func.lower(Invoice.number).like(like.lower())).limit(5)).all()
    for inv in invoices:
        results.append({"kind": "invoice", "id": inv.id, "label": inv.number})
    return {"results": results}


# ---- Camps ----
@router.get("/camps")
def list_camps(db: Session = Depends(get_db), user: User = Depends(current_user), page: int = 1, q: str | None = None):
    stmt = select(Camp).where(Camp.org_id == user.org_id).options(joinedload(Camp.client), joinedload(Camp.city))
    if q:
        stmt = stmt.where(or_(func.lower(Camp.name).like(f"%{q.lower()}%"), func.lower(Camp.camp_number).like(f"%{q.lower()}%")))
    rows = db.scalars(stmt.order_by(Camp.camp_date.desc())).unique().all()
    pnls = {r["camp_id"]: r for r in camps_with_pnl(db, list(rows))}
    return {"items": [{**pnls[c.id], "camp_number": c.camp_number, "client": c.client.name if c.client else None, "city": c.city.name if c.city else None} for c in rows]}


@router.post("/camps")
def create_camp(body: CampIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    count = len(db.scalars(select(Camp.id).where(Camp.org_id == user.org_id)).all())
    camp = Camp(org_id=user.org_id, camp_number=f"CMP-{count+1:03d}", **body.model_dump())
    db.add(camp)
    db.commit()
    db.refresh(camp)
    return camp_pnl(db, camp)


@router.get("/camps/{camp_id}")
def get_camp(camp_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    camp = db.get(Camp, camp_id)
    if not camp or camp.org_id != user.org_id:
        raise HTTPException(404, "Camp not found.")
    pnl = camp_pnl(db, camp)
    from app.models import Transaction
    txns = db.scalars(
        select(Transaction).where(Transaction.camp_id == camp.id, Transaction.status == "posted").order_by(Transaction.txn_date)
    ).all()
    pnl["transactions"] = [
        {"id": t.id, "date": t.txn_date.isoformat(), "type": t.txn_type, "category": t.category,
         "description": t.description, "amount": float(t.net_amount), "cost_nature": t.cost_nature}
        for t in txns
    ]
    pnl["client"] = db.get(Client, camp.client_id).name if camp.client_id else None
    pnl["city"] = db.get(City, camp.city_id).name if camp.city_id else None
    pnl["location"] = camp.location
    pnl["camp_number"] = camp.camp_number

    names = {e.id: e.name for e in db.scalars(select(Employee).where(Employee.org_id == user.org_id))}
    claims = db.scalars(
        select(Reimbursement).where(Reimbursement.org_id == user.org_id).order_by(Reimbursement.claim_date.desc())
    ).all()
    camp_claims = [r for r in claims if r.camp_id == camp.id]
    traveller_ids = {r.employee_id for r in camp_claims}
    monthly_all = [r for r in claims if (r.kind or "monthly") == "monthly" and not r.camp_id]
    monthly = [r for r in monthly_all if r.employee_id in traveller_ids] if traveller_ids else monthly_all[:8]
    if traveller_ids and not monthly:
        monthly = monthly_all[:8]

    buckets: dict[str, dict] = {}
    for r in camp_claims:
        row = buckets.setdefault(r.employee_id, {
            "employee_id": r.employee_id, "employee": names.get(r.employee_id, "Staff"),
            "stay": 0, "travel": 0, "food": 0, "other": 0, "total": 0, "status": r.status,
        })
        cat = r.category if r.category in {"stay", "travel", "food"} else "other"
        row[cat] = row.get(cat, 0) + float(r.amount)
        row["total"] += float(r.amount)

    def _claim(r: Reimbursement) -> dict:
        kind = r.kind or ("camp" if r.camp_id else "monthly")
        return {
            "id": r.id, "employee": names.get(r.employee_id), "date": r.claim_date.isoformat(),
            "kind": kind, "category": r.category, "amount": float(r.amount), "status": r.status,
            "description": r.description, "label": "Camp reimbursement" if kind == "camp" else "Monthly reimbursement",
            "period_year": r.period_year, "period_month": r.period_month,
        }

    pnl["travellers"] = sorted(buckets.values(), key=lambda x: x["employee"])
    pnl["camp_claims"] = [_claim(r) for r in camp_claims]
    pnl["monthly_claims"] = [_claim(r) for r in monthly[:20]]
    pnl["camp_reimb_total"] = sum(float(r.amount) for r in camp_claims)
    pnl["monthly_reimb_total"] = sum(float(r.amount) for r in monthly)

    money_in = [t for t in pnl["transactions"] if t["type"] == "revenue"]
    money_out = [t for t in pnl["transactions"] if t["type"] in {"cogs", "expense", "reimbursement", "payroll"}]
    cost_mix: dict[str, float] = {}
    for t in money_out:
        key = t["category"] or "misc"
        cost_mix[key] = cost_mix.get(key, 0) + t["amount"]
    mix = sorted(({"key": k, "amount": v} for k, v in cost_mix.items()), key=lambda x: -x["amount"])
    top = mix[0] if mix else None
    cost = pnl["total_cost"] or 0
    notes = [
        f"Profit {pnl['margin']}% of revenue." if pnl["revenue"] else "No revenue posted yet.",
        f"ROI {pnl['roi']}% — profit versus camp cost.",
    ]
    if top and cost:
        notes.append(f"Largest cost is {top['key'].replace('_', ' ')} at {top['amount'] / cost * 100:.0f}% of spend.")
    if pnl["net_profit"] < 0:
        notes.append("This camp is loss-making. Cut the largest cost line or raise package price.")
    elif pnl["margin"] < 20:
        notes.append("Margin is thin. Check lab, travel and stay before the next camp.")
    else:
        notes.append("Healthy margin. Keep this cost mix unless attendance drops.")
    pnl["money_in"] = money_in
    pnl["money_out"] = money_out
    pnl["cost_mix"] = mix
    pnl["analysis"] = notes
    return pnl


@router.patch("/camps/{camp_id}")
def update_camp(camp_id: str, body: CampIn, db: Session = Depends(get_db), user: User = Depends(require("edit"))):
    camp = db.get(Camp, camp_id)
    if not camp or camp.org_id != user.org_id:
        raise HTTPException(404, "Camp not found.")
    for k, v in body.model_dump().items():
        setattr(camp, k, v)
    db.commit()
    return camp_pnl(db, camp)


# ---- Packages ----
@router.get("/packages")
def list_packages(db: Session = Depends(get_db), user: User = Depends(current_user)):
    pkgs = db.scalars(select(Package).where(Package.org_id == user.org_id).options(joinedload(Package.costs))).unique().all()
    f = Filters(org_id=user.org_id)
    return {"items": [package_actuals(db, f, p) for p in pkgs]}


@router.post("/packages")
def create_package(body: PackageIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    pkg = Package(org_id=user.org_id, code=body.code, name=body.name, category=body.category,
                  description=body.description, selling_price=body.selling_price, gst_rate=body.gst_rate, is_active=body.is_active)
    pkg.costs = [PackageCost(cost_type=c.cost_type, amount=c.amount, diagnostic_partner_id=c.diagnostic_partner_id) for c in body.costs]
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return package_unit_economics(db, pkg)


@router.get("/packages/{package_id}")
def get_package(package_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    pkg = db.scalar(select(Package).where(Package.id == package_id).options(joinedload(Package.costs)))
    if not pkg or pkg.org_id != user.org_id:
        raise HTTPException(404, "Package not found.")
    return package_actuals(db, Filters(org_id=user.org_id), pkg)


@router.post("/packages/{package_id}/scenario")
def package_scenario(package_id: str, discount_pct: float | None = None, selling_price: float | None = None, partner_cost_increase_pct: float | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    from decimal import Decimal
    pkg = db.scalar(select(Package).where(Package.id == package_id).options(joinedload(Package.costs)))
    if not pkg or pkg.org_id != user.org_id:
        raise HTTPException(404, "Package not found.")
    factor = Decimal("1") + (Decimal(str(partner_cost_increase_pct or 0)) / Decimal("100"))
    return package_unit_economics(
        db, pkg,
        selling_override=Decimal(str(selling_price)) if selling_price is not None else None,
        cost_factor=factor,
        discount_pct=Decimal(str(discount_pct)) if discount_pct is not None else None,
    )


# ---- Clients ----
@router.get("/clients")
def list_clients(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(Client).where(Client.org_id == user.org_id)).all()
    out = []
    for c in rows:
        f = Filters(org_id=user.org_id, client_id=c.id)
        from app.services.finance import direct_costs, net_revenue, receivables
        rev = net_revenue(db, f)
        cost = direct_costs(db, f)
        camps_n = len(db.scalars(select(Camp.id).where(Camp.client_id == c.id)).all())
        out.append({
            "id": c.id, "name": c.name, "gstin": c.gstin, "industry": c.industry, "status": c.status,
            "revenue": float(rev), "cost": float(cost), "profit": float(rev - cost),
            "margin": float((rev - cost) / rev * 100) if rev else 0,
            "camps": camps_n, "outstanding": float(receivables(db, f)),
        })
    out.sort(key=lambda x: x["revenue"], reverse=True)
    return {"items": out}


@router.post("/clients")
def create_client(body: ClientIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    c = Client(org_id=user.org_id, **body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "name": c.name}


@router.get("/clients/{client_id}")
def get_client(client_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    c = db.get(Client, client_id)
    if not c or c.org_id != user.org_id:
        raise HTTPException(404, "Client not found.")
    f = Filters(org_id=user.org_id, client_id=c.id)
    from app.services.finance import direct_costs, net_revenue, opex, receivables
    rev = net_revenue(db, f)
    dc = direct_costs(db, f)
    ox = opex(db, f)
    camps = db.scalars(select(Camp).where(Camp.client_id == c.id)).all()
    return {
        "id": c.id, "name": c.name, "gstin": c.gstin, "billing_address": c.billing_address,
        "industry": c.industry, "payment_terms_days": c.payment_terms_days,
        "revenue": float(rev), "direct_cost": float(dc), "allocated_cost": float(ox),
        "gross_profit": float(rev - dc), "net_profit": float(rev - dc - ox),
        "margin": float((rev - dc - ox) / rev * 100) if rev else 0,
        "outstanding": float(receivables(db, f)),
        "camps": [camp_pnl(db, x) for x in camps],
    }


# ---- Partners ----
@router.get("/partners")
def list_partners(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(DiagnosticPartner).where(DiagnosticPartner.org_id == user.org_id)).all()
    out = []
    for p in rows:
        f = Filters(org_id=user.org_id, diagnostic_partner_id=p.id)
        from app.services.finance import direct_costs, net_revenue
        rev = net_revenue(db, f)
        cost = direct_costs(db, f)
        out.append({
            "id": p.id, "name": p.name, "partner_type": p.partner_type, "gstin": p.gstin,
            "status": p.status, "payment_terms_days": p.payment_terms_days,
            "revenue": float(rev), "payout": float(cost), "contribution": float(rev - cost),
            "margin": float((rev - cost) / rev * 100) if rev else 0,
        })
    return {"items": out}


@router.post("/partners")
def create_partner(body: PartnerIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    p = DiagnosticPartner(org_id=user.org_id, **body.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "name": p.name}


@router.get("/partners/{partner_id}")
def get_partner(partner_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = db.get(DiagnosticPartner, partner_id)
    if not p or p.org_id != user.org_id:
        raise HTTPException(404, "Partner not found.")
    prices = db.scalars(select(PartnerPrice).where(PartnerPrice.partner_id == p.id)).all()
    f = Filters(org_id=user.org_id, diagnostic_partner_id=p.id)
    from app.services.finance import direct_costs, net_revenue
    rev = net_revenue(db, f)
    cost = direct_costs(db, f)
    return {
        "id": p.id, "name": p.name, "gstin": p.gstin, "contact": p.contact,
        "revenue": float(rev), "payout": float(cost), "contribution": float(rev - cost),
        "margin": float((rev - cost) / rev * 100) if rev else 0,
        "prices": [
            {"id": x.id, "test_name": x.test_name, "partner_cost": float(x.partner_cost),
             "selling_price": float(x.selling_price), "margin": float((x.selling_price - x.partner_cost) / x.selling_price * 100) if x.selling_price else 0}
            for x in prices
        ],
    }


# ---- Clinicians (doctors & nutritionists) ----
@router.get("/clinicians")
def list_clinicians(db: Session = Depends(get_db), user: User = Depends(require("view_ops_detail")), kind: str | None = None):
    stmt = select(Clinician).where(Clinician.org_id == user.org_id)
    if kind in {"doctor", "nutritionist"}:
        stmt = stmt.where(Clinician.kind == kind)
    rows = db.scalars(stmt.order_by(Clinician.kind, Clinician.name)).all()
    paid = db.execute(
        select(Expense.clinician_id, func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.org_id == user.org_id, Expense.clinician_id.isnot(None), Expense.approval_status == "approved")
        .group_by(Expense.clinician_id)
    ).all()
    totals = {cid: float(amt) for cid, amt in paid}
    return {"items": [
        {"id": c.id, "name": c.name, "kind": c.kind, "specialty": c.specialty, "phone": c.phone,
         "typical_fee": float(c.typical_fee), "status": c.status, "paid": totals.get(c.id, 0)}
        for c in rows
    ]}


@router.post("/clinicians")
def create_clinician(body: ClinicianIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    if body.kind not in {"doctor", "nutritionist"}:
        raise HTTPException(400, "Kind must be doctor or nutritionist.")
    c = Clinician(org_id=user.org_id, **body.model_dump(), status="active")
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "name": c.name, "kind": c.kind}


@router.post("/camps/{camp_id}/traveller")
def add_camp_traveller(camp_id: str, body: CampTravellerIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    camp = db.get(Camp, camp_id)
    if not camp or camp.org_id != user.org_id:
        raise HTTPException(404, "Camp not found.")
    emp = db.get(Employee, body.employee_id)
    if not emp or emp.org_id != user.org_id:
        raise HTTPException(400, "Employee not found.")
    lines = [("stay", body.stay), ("travel", body.travel), ("food", body.food), ("other", body.other)]
    created = []
    for cat, amt in lines:
        if not amt or amt <= 0:
            continue
        r = Reimbursement(
            org_id=user.org_id, employee_id=emp.id, claim_date=body.claim_date, kind="camp",
            category=cat, amount=amt, camp_id=camp.id, client_id=camp.client_id,
            description=f"Camp reimbursement · {cat} · {emp.name} · {camp.name}",
            status="submitted",
        )
        db.add(r)
        created.append(cat)
    if not created:
        raise HTTPException(400, "Enter stay, travel, food or other.")
    db.commit()
    return {"ok": True, "lines": created}


# ---- Employees ----
@router.get("/employees")
def list_employees(db: Session = Depends(get_db), user: User = Depends(require("view_ops_detail"))):
    rows = db.scalars(select(Employee).where(Employee.org_id == user.org_id)).all()
    return {"items": [
        {"id": e.id, "code": e.employee_code, "name": e.name, "department": e.department,
         "designation": e.designation, "monthly_salary": float(e.monthly_salary), "ctc": float(e.ctc), "status": e.status}
        for e in rows
    ]}


@router.post("/employees")
def create_employee(body: EmployeeIn, db: Session = Depends(get_db), user: User = Depends(require("create"))):
    e = Employee(org_id=user.org_id, **body.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return {"id": e.id, "name": e.name}
