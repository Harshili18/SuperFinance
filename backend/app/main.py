from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text

from app.api.analytics import router as analytics_router
from app.api.auth import router as auth_router
from app.api.money import router as money_router
from app.api.ops import router as ops_router
from app.api.resources import router as resources_router
from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.models import Account, Base, Organization
from app.services.ledger import COA, LedgerError
from app.services.seed import seed

_WEAK_SECRETS = {
    "change-me-to-a-long-random-string",
    "dev-only-change-me",
    "dev-superfinance-change-before-production",
    "change-me-in-production",
}

if not settings.is_dev and settings.secret_key in _WEAK_SECRETS:
    raise RuntimeError("Set a strong SECRET_KEY before running with ENVIRONMENT=production.")

if not settings.is_dev and not settings.cookie_secure:
    raise RuntimeError(
        "Set COOKIE_SECURE=true for ENVIRONMENT=production (HTTPS auth cookies)."
    )

# Validate cookie settings early (raises if none without secure in prod)
_ = settings.cookie_kwargs

app = FastAPI(
    title="SUPERFINANCE",
    version="0.2.0",
    docs_url="/api/docs" if settings.is_dev else None,
    openapi_url="/api/openapi.json" if settings.is_dev else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(LedgerError)
async def ledger_handler(_: Request, exc: LedgerError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(HTTPException)
async def http_handler(_: Request, exc: HTTPException):
    detail = exc.detail
    if not isinstance(detail, str):
        detail = str(detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": detail})


def _ensure_coa(db) -> None:
    orgs = db.scalars(select(Organization)).all()
    for org in orgs:
        existing = set(db.scalars(select(Account.code).where(Account.org_id == org.id)).all())
        for code, name, typ, cash in COA:
            if code not in existing:
                db.add(Account(org_id=org.id, code=code, name=name, type=typ, is_cash=cash))
    db.commit()


def _ensure_columns() -> None:
    """SQLite create_all does not add new columns on existing tables."""
    if engine.dialect.name != "sqlite":
        return
    try:
        _ensure_columns_inner()
    except Exception as exc:
        print(f"schema ensure skipped: {exc}")


def _ensure_columns_inner() -> None:
    stmts = [
        ("reimbursements", "kind", "ALTER TABLE reimbursements ADD COLUMN kind VARCHAR(20) DEFAULT 'monthly'"),
        ("reimbursements", "period_year", "ALTER TABLE reimbursements ADD COLUMN period_year INTEGER"),
        ("reimbursements", "period_month", "ALTER TABLE reimbursements ADD COLUMN period_month INTEGER"),
        ("expenses", "clinician_id", "ALTER TABLE expenses ADD COLUMN clinician_id VARCHAR(36)"),
        ("expenses", "subcategory", "ALTER TABLE expenses ADD COLUMN subcategory VARCHAR(80)"),
        ("transactions", "subcategory", "ALTER TABLE transactions ADD COLUMN subcategory VARCHAR(80)"),
    ]
    with engine.begin() as conn:
        tables = {r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
        for table, col, ddl in stmts:
            if table not in tables:
                continue
            existing = {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))}
            if col not in existing:
                conn.execute(text(ddl))
        if "reimbursements" in tables:
            conn.execute(text("UPDATE reimbursements SET kind = 'camp' WHERE camp_id IS NOT NULL"))
            conn.execute(text("UPDATE reimbursements SET kind = 'monthly' WHERE camp_id IS NULL AND (kind IS NULL OR kind = '')"))


def _ensure_demo_people(db) -> None:
    """Fill doctors/nutritionists and monthly claims on an existing demo DB."""
    from datetime import date
    from decimal import Decimal

    from app.models import Clinician, Employee, Reimbursement

    org = db.scalar(select(Organization).limit(1))
    if not org:
        return
    try:
        _ensure_demo_people_body(db, org, date, Decimal, Clinician, Employee, Reimbursement)
    except Exception as exc:
        db.rollback()
        print(f"demo people skipped: {exc}")


def _ensure_demo_people_body(db, org, date, Decimal, Clinician, Employee, Reimbursement) -> None:
    if not db.scalar(select(Clinician.id).limit(1)):
        db.add_all([
            Clinician(org_id=org.id, name="Dr. Meera Shah", kind="doctor", specialty="General physician", typical_fee=12000),
            Clinician(org_id=org.id, name="Dr. Arjun Rao", kind="doctor", specialty="Internal medicine", typical_fee=15000),
            Clinician(org_id=org.id, name="Dr. Kavya Nair", kind="doctor", specialty="Cardiology", typical_fee=18000),
            Clinician(org_id=org.id, name="Riya Menon", kind="nutritionist", specialty="Clinical nutrition", typical_fee=8000),
            Clinician(org_id=org.id, name="Aisha Khan", kind="nutritionist", specialty="Sports nutrition", typical_fee=7500),
            Clinician(org_id=org.id, name="Neel Patel", kind="nutritionist", specialty="Metabolic health", typical_fee=7000),
        ])
    if not db.scalar(select(Reimbursement.id).where(Reimbursement.kind == "monthly").limit(1)):
        emps = db.scalars(select(Employee).where(Employee.org_id == org.id).limit(6)).all()
        today = date.today()
        for i, emp in enumerate(emps):
            cat = "phone" if i % 2 == 0 else "internet"
            db.add(Reimbursement(
                org_id=org.id, employee_id=emp.id, claim_date=today,
                kind="monthly", category=cat, amount=Decimal(str(1800 + i * 200)),
                period_year=today.year, period_month=today.month,
                description=f"Monthly reimbursement · {cat} · {emp.name}",
                status="submitted",
            ))
    db.commit()


def _ensure_subscriptions(db) -> None:
    """Add Cursor / Claude / Figma opex on an existing demo DB."""
    from datetime import date
    from decimal import Decimal

    from app.models import Expense, Vendor
    from app.services.ledger import CATEGORY_ACCOUNT, post_transaction

    org = db.scalar(select(Organization).limit(1))
    if not org:
        return
    try:
        today = date.today().replace(day=min(date.today().day, 25))
        tools = [
            ("Cursor", "cursor", Decimal("20000")),
            ("Anthropic Claude", "claude", Decimal("15000")),
            ("Figma", "figma", Decimal("4500")),
        ]
        existing = {
            (e.subcategory or "").lower()
            for e in db.scalars(select(Expense).where(Expense.org_id == org.id, Expense.category == "software")).all()
        }
        n = db.scalar(select(func.count()).select_from(Expense).where(Expense.org_id == org.id)) or 0
        for name, tool, amt in tools:
            vendor = db.scalar(select(Vendor).where(Vendor.org_id == org.id, Vendor.name == name))
            if not vendor:
                vendor = Vendor(org_id=org.id, name=name, category="software")
                db.add(vendor)
                db.flush()
            if tool in existing:
                continue
            n += 1
            code = CATEGORY_ACCOUNT.get(tool, "6030")
            e = Expense(
                org_id=org.id, expense_number=f"EXP-{int(n):04d}", expense_date=today,
                amount=amt, category="software", subcategory=tool, cost_nature="indirect",
                vendor_id=vendor.id, payment_method="bank", description=f"{name} subscription",
                approval_status="approved", payment_status="paid", account_code=code,
            )
            db.add(e)
            db.flush()
            post_transaction(
                db, org_id=org.id, user_id=None, txn_date=today,
                txn_type="expense", amount=amt, account_code=code, contra_code="1010",
                description=e.description, payment_status="paid", payment_method="bank",
                category="software", subcategory=tool, cost_nature="indirect",
                dimensions={"vendor_id": vendor.id, "expense_id": e.id, "source": "opex"},
            )
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"subscriptions skipped: {exc}")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    db = SessionLocal()
    try:
        if settings.is_dev and not db.scalar(select(Organization)):
            seed(db)
        _ensure_coa(db)
        _ensure_demo_people(db)
        if settings.is_dev:
            _ensure_subscriptions(db)
    except Exception as exc:
        db.rollback()
        print(f"STARTUP FAILED: {exc}")
        raise
    finally:
        db.close()


@app.get("/api/v1/health")
def health():
    return {"ok": True, "service": "superfinance", "env": settings.environment, "build": "money-out"}


@app.post("/api/v1/admin/seed")
def admin_seed():
    if not settings.is_dev:
        raise HTTPException(403, "Seed is disabled outside development.")
    db = SessionLocal()
    try:
        return seed(db, force=False)
    finally:
        db.close()


app.include_router(auth_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(resources_router, prefix="/api/v1")
app.include_router(money_router, prefix="/api/v1")
app.include_router(ops_router, prefix="/api/v1")
