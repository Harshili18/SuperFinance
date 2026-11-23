from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.rbac import Role
from app.core.security import hash_secret
from app.models import (
    Account,
    AccountingPeriod,
    Budget,
    Camp,
    City,
    Client,
    Customer,
    Clinician,
    DiagnosticPartner,
    Document,
    Employee,
    Expense,
    Invoice,
    InvoiceItem,
    Notification,
    Organization,
    Package,
    PackageCost,
    PartnerPrice,
    Payment,
    Reimbursement,
    SalaryRecord,
    User,
    Vendor,
)
from app.services.ledger import CATEGORY_ACCOUNT, COA, REVENUE_ACCOUNT, post_transaction

D = Decimal


def seed(db: Session, force: bool = False) -> dict:
    existing = db.scalar(select(Organization))
    if existing and not force:
        return {"status": "exists", "org_id": existing.id}

    org = Organization(name="SUPERSSHYFT", legal_name="Supersshyft Health Technologies Pvt Ltd", gstin="27AABCU9603R1ZM")
    db.add(org)
    db.flush()

    users = [
        User(org_id=org.id, name="Harshili", email="founder@supersshyft.com", phone="9876543210",
             password_hash=hash_secret("supersshyft"), role=Role.FOUNDER),
        User(org_id=org.id, name="Finance Admin", email="finance@supersshyft.com", phone="9876543211",
             password_hash=hash_secret("supersshyft"), role=Role.FINANCE_ADMIN),
        User(org_id=org.id, name="Ops Lead", email="ops@supersshyft.com", phone="9876543212",
             password_hash=hash_secret("supersshyft"), role=Role.OPERATIONS),
        User(org_id=org.id, name="Investor View", email="investor@supersshyft.com", phone="9876543213",
             password_hash=hash_secret("investor"), role=Role.INVESTOR),
    ]
    db.add_all(users)
    db.flush()
    founder = users[0]

    for code, name, typ, cash in COA:
        db.add(Account(org_id=org.id, code=code, name=name, type=typ, is_cash=cash))

    today = date.today()
    for i in range(18):
        y, m = today.year, today.month - i
        while m <= 0:
            m += 12
            y -= 1
        db.add(AccountingPeriod(org_id=org.id, year=y, month=m, status="open"))

    cities = [
        City(org_id=org.id, name="Mumbai", state="Maharashtra"),
        City(org_id=org.id, name="Delhi", state="Delhi"),
        City(org_id=org.id, name="Bengaluru", state="Karnataka"),
        City(org_id=org.id, name="Pune", state="Maharashtra"),
        City(org_id=org.id, name="Hyderabad", state="Telangana"),
    ]
    db.add_all(cities)
    db.flush()
    mum, delh, blr, pune, hyd = cities

    clients_data = [
        ("Aarav Pharma Pvt Ltd", mum, "pharma", "27AAPCA1111A1Z1"),
        ("Nimbus IT Services", blr, "it", "29AABCN2222B1Z2"),
        ("Horizon Manufacturing", pune, "manufacturing", "27AADCH3333C1Z3"),
        ("Vedika Retail Ltd", mum, "retail", "27AAACV4444D1Z4"),
        ("Sierra Logistics", delh, "logistics", "07AAACS5555E1Z5"),
        ("Lumen Hospitals", hyd, "healthcare", "36AAACL6666F1Z6"),
        ("Orbit BFSI", mum, "bfsi", "27AAACO7777G1Z7"),
        ("Kite Education", delh, "education", "07AAACK8888H1Z8"),
        ("Pine Labs Campus", blr, "it", "29AAACP9999I1Z9"),
        ("Coastal Foods", hyd, "fmcg", "36AAACC1010J1ZA"),
    ]
    clients = []
    for name, city, industry, gst in clients_data:
        c = Client(org_id=org.id, name=name, legal_name=name, gstin=gst, city_id=city.id,
                   industry=industry, billing_address=f"{name}, {city.name}", payment_terms_days=30)
        clients.append(c)
    db.add_all(clients)
    db.flush()

    partners = [
        DiagnosticPartner(org_id=org.id, name="Thyrocare Technologies", partner_type="lab", city_id=mum.id, gstin="27AABCT0001A1Z1", contact="ops@thyrocare.example", payment_terms_days=21),
        DiagnosticPartner(org_id=org.id, name="SRL Diagnostics", partner_type="lab", city_id=mum.id, gstin="27AABCS0002B1Z2", contact="b2b@srl.example", payment_terms_days=21),
        DiagnosticPartner(org_id=org.id, name="Metropolis Healthcare", partner_type="lab", city_id=blr.id, gstin="29AABCM0003C1Z3", contact="partner@metropolis.example", payment_terms_days=15),
        DiagnosticPartner(org_id=org.id, name="Healthians", partner_type="lab", city_id=delh.id, gstin="07AABCH0004D1Z4", contact="corp@healthians.example", payment_terms_days=30),
    ]
    db.add_all(partners)
    db.flush()

    pkgs_spec = [
        ("SV-5000", "Super Vital", "full_body", 4999, 2100, 400, 250, 80),
        ("DC-1999", "Diabetes Care", "chronic", 1999, 780, 250, 120, 40),
        ("HC-3499", "Heart Check", "cardiac", 3499, 1500, 400, 180, 60),
        ("WH-2999", "Women's Health", "wellness", 2999, 1200, 350, 160, 50),
        ("EX-7999", "Executive Full Body", "executive", 7999, 3200, 800, 400, 120),
        ("TH-1299", "Thyroid Panel", "endocrine", 1299, 420, 0, 80, 25),
        ("VP-2499", "Vitamin Profile", "wellness", 2499, 980, 200, 120, 40),
        ("CB-999", "Camp Basic", "camp", 999, 420, 0, 60, 18),
    ]
    packages = []
    for i, (code, name, cat, price, diag, cons, ops, gw) in enumerate(pkgs_spec):
        p = Package(org_id=org.id, code=code, name=name, category=cat, selling_price=D(price),
                    description=f"{name} preventive health package")
        p.costs = [
            PackageCost(cost_type="diagnostic", amount=D(diag), diagnostic_partner_id=partners[i % 4].id),
            PackageCost(cost_type="consultation", amount=D(cons)),
            PackageCost(cost_type="operations", amount=D(ops)),
            PackageCost(cost_type="gateway", amount=D(gw)),
        ]
        packages.append(p)
    db.add_all(packages)
    db.flush()

    for i, pkg in enumerate(packages):
        partner = partners[i % 4]
        diag = next(c.amount for c in pkg.costs if c.cost_type == "diagnostic")
        db.add(PartnerPrice(partner_id=partner.id, package_id=pkg.id, test_name=pkg.name,
                            partner_cost=diag, selling_price=pkg.selling_price))

    vendors = [
        Vendor(org_id=org.id, name="Metro Venues", category="venue", city_id=mum.id),
        Vendor(org_id=org.id, name="Swift Logistics Co", category="logistics", city_id=mum.id),
        Vendor(org_id=org.id, name="PrintCraft", category="marketing", city_id=delh.id),
        Vendor(org_id=org.id, name="CloudStack India", category="technology", city_id=blr.id),
        Vendor(org_id=org.id, name="OfficeMart", category="office", city_id=mum.id),
        Vendor(org_id=org.id, name="MediConsumables", category="medical", city_id=pune.id),
        Vendor(org_id=org.id, name="TravelDesk", category="travel", city_id=delh.id),
        Vendor(org_id=org.id, name="Cafe Circle", category="food", city_id=mum.id),
        Vendor(org_id=org.id, name="AWS India", category="technology", city_id=blr.id),
        Vendor(org_id=org.id, name="Figma / SaaS stack", category="software", city_id=blr.id),
        Vendor(org_id=org.id, name="Legal Counsel LLP", category="legal", city_id=mum.id),
        Vendor(org_id=org.id, name="CA Associates", category="accounting", city_id=mum.id),
        Vendor(org_id=org.id, name="BrandKit", category="marketing", city_id=blr.id),
        Vendor(org_id=org.id, name="Phlebo Network", category="staffing", city_id=hyd.id),
        Vendor(org_id=org.id, name="City Rentals", category="rent", city_id=mum.id),
        Vendor(org_id=org.id, name="Airtel Business", category="communication", city_id=delh.id),
        Vendor(org_id=org.id, name="ICICI Insurance", category="insurance", city_id=mum.id),
        Vendor(org_id=org.id, name="Event Crew", category="staffing", city_id=pune.id),
        Vendor(org_id=org.id, name="Cold Chain Pack", category="logistics", city_id=hyd.id),
        Vendor(org_id=org.id, name="Meta Ads", category="marketing", city_id=blr.id),
        Vendor(org_id=org.id, name="Cursor", category="software", city_id=blr.id),
        Vendor(org_id=org.id, name="Anthropic Claude", category="software", city_id=blr.id),
        Vendor(org_id=org.id, name="Figma", category="software", city_id=blr.id),
    ]
    db.add_all(vendors)
    db.flush()

    depts = [("Operations", "Camp Manager"), ("Finance", "Accountant"), ("Sales", "B2B Lead"),
             ("Medical", "Nutritionist"), ("Tech", "Engineer"), ("HR", "HR Executive")]
    employees = []
    salaries = [85000, 72000, 90000, 65000, 110000, 55000, 48000, 125000, 70000, 60000,
                95000, 52000, 80000, 45000, 150000, 68000, 58000, 76000, 42000, 88000]
    for i, sal in enumerate(salaries):
        dept, desig = depts[i % 6]
        emp = Employee(
            org_id=org.id, employee_code=f"SS-{100+i}", name=f"Team Member {i+1}",
            department=dept, designation=desig, joining_date=date(2024, 1, 15),
            monthly_salary=D(sal), ctc=D(sal * 14), city_id=cities[i % 5].id,
        )
        employees.append(emp)
    db.add_all(employees)
    db.flush()

    clinicians = [
        Clinician(org_id=org.id, name="Dr. Meera Shah", kind="doctor", specialty="General physician", typical_fee=D("12000")),
        Clinician(org_id=org.id, name="Dr. Arjun Rao", kind="doctor", specialty="Internal medicine", typical_fee=D("15000")),
        Clinician(org_id=org.id, name="Dr. Kavya Nair", kind="doctor", specialty="Cardiology", typical_fee=D("18000")),
        Clinician(org_id=org.id, name="Riya Menon", kind="nutritionist", specialty="Clinical nutrition", typical_fee=D("8000")),
        Clinician(org_id=org.id, name="Aisha Khan", kind="nutritionist", specialty="Sports nutrition", typical_fee=D("7500")),
        Clinician(org_id=org.id, name="Neel Patel", kind="nutritionist", specialty="Metabolic health", typical_fee=D("7000")),
    ]
    db.add_all(clinicians)
    db.flush()

    customers = [Customer(org_id=org.id, external_id=f"CUS-{1000+i}", display_name=f"Customer {i+1}",
                          city_id=cities[i % 5].id, channel="app" if i % 3 else "website")
                 for i in range(100)]
    db.add_all(customers)
    db.flush()

    # 10 camps across recent months
    camp_specs = [
        ("CMP-001", "Mumbai — Aarav Pharma", clients[0], mum, date(today.year, max(1, today.month-2), 12), "b2b", 180, 164, 820000, 520000),
        ("CMP-002", "Bengaluru — Nimbus IT", clients[1], blr, date(today.year, max(1, today.month-2), 22), "b2b", 220, 201, 980000, 610000),
        ("CMP-003", "Pune — Horizon Plant", clients[2], pune, date(today.year, max(1, today.month-1), 8), "b2b", 140, 128, 540000, 265000),
        ("CMP-004", "Delhi — Sierra Logistics", clients[4], delh, date(today.year, max(1, today.month-1), 18), "b2b", 90, 76, 310000, 245000),
        ("CMP-005", "Hyderabad — Lumen Hospitals", clients[5], hyd, date(today.year, today.month, 4), "b2b", 110, 98, 470000, 290000),
        ("CMP-006", "Mumbai — Orbit BFSI", clients[6], mum, date(today.year, today.month, 9), "b2b", 250, 238, 1350000, 780000),
        ("CMP-007", "Delhi — Kite Education", clients[7], delh, date(today.year, max(1, today.month-3), 14), "b2b", 160, 142, 420000, 390000),
        ("CMP-008", "Bengaluru Community Camp", None, blr, date(today.year, max(1, today.month-1), 26), "b2c", 80, 71, 180000, 95000),
        ("CMP-009", "Pune Weekend Camp", None, pune, date(today.year, today.month, 2), "b2c", 60, 54, 125000, 48000),
        ("CMP-010", "Mumbai — Vedika Retail", clients[3], mum, date(today.year, max(1, today.month-3), 6), "b2b", 200, 186, 760000, 510000),
    ]
    camps = []
    for num, name, client, city, dt, ch, exp_a, act_a, exp_r, budget in camp_specs:
        c = Camp(
            org_id=org.id, camp_number=num, name=name, client_id=client.id if client else None,
            city_id=city.id, location=f"{city.name} campus", camp_date=dt, start_time="08:00",
            end_time="16:00", camp_type="corporate" if ch == "b2b" else "community",
            channel=ch, expected_attendees=exp_a, actual_attendees=act_a,
            expected_revenue=D(exp_r), budget=D(budget), status="completed",
        )
        camps.append(c)
    db.add_all(camps)
    db.flush()

    def dims(**kwargs):
        return kwargs

    inv_counter = 1
    exp_counter = 1

    # Opening capital / cash
    post_transaction(
        db, org_id=org.id, user_id=founder.id, txn_date=date(today.year - 1, 4, 1),
        txn_type="transfer", amount=D("35000000"), account_code="1010", contra_code="3000",
        net_amount=D("35000000"), description="Founder capital introduced",
        payment_status="paid", payment_method="bank", category="capital",
        debit_account="1010", credit_account="3000",
    )

    # Monthly opex + salaries for 12 months
    for m in range(12):
        month_start = date(today.year, today.month, 1) - timedelta(days=30 * (11 - m))
        month_start = date(month_start.year, month_start.month, 1)
        pay_day = date(month_start.year, month_start.month, min(28, 25))

        salary_total = sum(int(e.monthly_salary) for e in employees)
        post_transaction(
            db, org_id=org.id, user_id=founder.id, txn_date=pay_day,
            txn_type="payroll", amount=D(salary_total), account_code="6000", contra_code="1010",
            description=f"Monthly payroll {pay_day.strftime('%b %Y')}",
            payment_status="paid", payment_method="bank", category="salaries",
            cost_nature="indirect",
        )
        for e in employees[:5]:
            db.add(SalaryRecord(org_id=org.id, employee_id=e.id, period_year=pay_day.year,
                                period_month=pay_day.month, gross=e.monthly_salary,
                                employer_cost=e.monthly_salary, status="posted"))

        recurring = [
            ("rent", 185000, vendors[14], "Office rent", None),
            ("software", 20000, vendors[20], "Cursor AI", "cursor"),
            ("software", 15000, vendors[21], "Claude AI", "claude"),
            ("software", 4500, vendors[22], "Figma", "figma"),
            ("technology", 68000, vendors[8], "Cloud hosting", None),
            ("marketing", 95000 + m * 4000, vendors[19], "Performance ads", None),
            ("communication", 18000, vendors[15], "Telecom", None),
            ("insurance", 22000, vendors[16], "Health insurance", None),
            ("accounting", 35000, vendors[11], "CA retainer", None),
            ("office", 14000, vendors[4], "Office supplies", None),
        ]
        for cat, amt, vendor, desc, sub in recurring:
            code = CATEGORY_ACCOUNT.get(sub or cat, "6900")
            e = Expense(
                org_id=org.id, expense_number=f"EXP-{exp_counter:04d}", expense_date=pay_day,
                amount=D(amt), category=cat, subcategory=sub, cost_nature="indirect", vendor_id=vendor.id,
                city_id=mum.id, payment_method="bank", description=desc,
                approval_status="approved", payment_status="paid", account_code=code,
                created_by=founder.id, approved_by=founder.id,
            )
            db.add(e)
            db.flush()
            post_transaction(
                db, org_id=org.id, user_id=founder.id, txn_date=pay_day,
                txn_type="expense", amount=D(amt), account_code=code, contra_code="1010",
                description=desc, payment_status="paid", payment_method="bank",
                category=cat, subcategory=sub, cost_nature="indirect",
                dimensions=dims(vendor_id=vendor.id, city_id=mum.id, expense_id=e.id, source="opex"),
            )
            exp_counter += 1

        db.add(Budget(org_id=org.id, year=pay_day.year, month=pay_day.month, category="marketing", amount=D("90000")))
        db.add(Budget(org_id=org.id, year=pay_day.year, month=pay_day.month, category="salaries", amount=D(str(salary_total))))
        db.add(Budget(org_id=org.id, year=pay_day.year, month=pay_day.month, category="technology", amount=D("70000")))
        db.add(Budget(org_id=org.id, year=pay_day.year, month=pay_day.month, category="operations", amount=D("200000")))
        db.add(Budget(org_id=org.id, year=pay_day.year, month=pay_day.month, category="revenue", amount=D("2200000")))

        # App / B2C revenue throughout the month
        for day in (3, 8, 12, 18, 24):
            d = date(month_start.year, month_start.month, min(day, 28))
            pkg = packages[day % len(packages)]
            qty = 6 + (m % 5)
            gross = D(pkg.selling_price) * qty
            cust = customers[(m * 5 + day) % len(customers)]
            city = cities[day % 5]
            post_transaction(
                db, org_id=org.id, user_id=founder.id, txn_date=d,
                txn_type="revenue", amount=gross, account_code="4020", contra_code="1010",
                tax_amount=D(gross * D("0.18") / D("1.18")),
                description=f"App sales {pkg.name} x{qty}",
                payment_status="paid", payment_method="upi", category="app",
                dimensions=dims(
                    city_id=city.id, package_id=pkg.id, customer_id=cust.id,
                    channel="app", business_model="b2c", source="app",
                    diagnostic_partner_id=pkg.costs[0].diagnostic_partner_id,
                ),
            )
            # diagnostic COGS for those sales
            diag = next(c.amount for c in pkg.costs if c.cost_type == "diagnostic") * qty
            post_transaction(
                db, org_id=org.id, user_id=founder.id, txn_date=d,
                txn_type="cogs", amount=diag, account_code="5000", contra_code="2000",
                description=f"Partner cost {pkg.name} x{qty}",
                payment_status="unpaid", category="diagnostic", cost_nature="direct",
                dimensions=dims(
                    city_id=city.id, package_id=pkg.id, channel="app", business_model="b2c",
                    diagnostic_partner_id=pkg.costs[0].diagnostic_partner_id, source="app",
                ),
            )

    # Camp revenue + expenses
    camp_pkg = packages[0]
    basic = packages[7]
    for idx, camp in enumerate(camps):
        client = next((c for c in clients if c.id == camp.client_id), None)
        pkg = camp_pkg if camp.channel == "b2b" else basic
        attendees = camp.actual_attendees
        unit = D(pkg.selling_price)
        gross = unit * attendees
        tax = D(gross * D("0.18") / D("1.18"))
        post_transaction(
            db, org_id=org.id, user_id=founder.id, txn_date=camp.camp_date,
            txn_type="revenue", amount=gross, account_code=REVENUE_ACCOUNT[camp.channel],
            contra_code="1100", tax_amount=tax,
            description=f"Camp package sales — {camp.name}",
            payment_status="unpaid" if camp.channel == "b2b" else "paid",
            category="camp", cost_nature=None,
            dimensions=dims(
                camp_id=camp.id, city_id=camp.city_id, client_id=camp.client_id,
                package_id=pkg.id, channel="camp", business_model=camp.channel, source="camp",
                diagnostic_partner_id=pkg.costs[0].diagnostic_partner_id,
            ),
        )
        diag = next(c.amount for c in pkg.costs if c.cost_type == "diagnostic") * attendees
        partner = partners[idx % 4]
        e = Expense(
            org_id=org.id, expense_number=f"EXP-{exp_counter:04d}", expense_date=camp.camp_date,
            amount=diag, category="diagnostic", cost_nature="direct",
            diagnostic_partner_id=partner.id, camp_id=camp.id, client_id=camp.client_id,
            city_id=camp.city_id, package_id=pkg.id, description="Diagnostic partner payout",
            approval_status="approved", payment_status="unpaid", account_code="5000",
            created_by=founder.id, approved_by=founder.id,
        )
        db.add(e)
        db.flush()
        post_transaction(
            db, org_id=org.id, user_id=founder.id, txn_date=camp.camp_date,
            txn_type="cogs", amount=diag, account_code="5000", contra_code="2000",
            description="Diagnostic partner cost", payment_status="unpaid",
            category="diagnostic", cost_nature="direct",
            dimensions=dims(
                camp_id=camp.id, city_id=camp.city_id, client_id=camp.client_id,
                package_id=pkg.id, diagnostic_partner_id=partner.id,
                channel="camp", business_model=camp.channel, expense_id=e.id, source="camp",
            ),
        )
        exp_counter += 1

        extras = [
            ("venue", D("30000"), "direct", "Venue"),
            ("travel", D("12000"), "direct", "Team travel"),
            ("food", D("8000"), "direct", "Food"),
            ("stay", D("18000"), "direct", "Stay"),
            ("goodie_bags", D("7500"), "direct", "Goodie bags"),
            ("marketing_materials", D("15000") if camp.channel == "b2c" else D("6000"), "direct", "Marketing materials"),
            ("logistics", D("9000"), "direct", "Logistics"),
            ("phlebotomist", D("10000"), "direct", "Phlebotomists"),
        ]
        for cat, amt, nature, desc in extras:
            code = CATEGORY_ACCOUNT.get(cat, "5040")
            e = Expense(
                org_id=org.id, expense_number=f"EXP-{exp_counter:04d}", expense_date=camp.camp_date,
                amount=amt, category=cat, cost_nature=nature, camp_id=camp.id, client_id=camp.client_id,
                city_id=camp.city_id, vendor_id=vendors[0].id, description=f"{desc} — {camp.name}",
                approval_status="approved", payment_status="paid", account_code=code,
                created_by=founder.id, approved_by=founder.id,
            )
            db.add(e)
            db.flush()
            post_transaction(
                db, org_id=org.id, user_id=founder.id, txn_date=camp.camp_date,
                txn_type="cogs" if nature == "direct" else "expense",
                amount=amt, account_code=code, contra_code="1010",
                description=e.description, payment_status="paid", payment_method="bank",
                category=cat, cost_nature=nature,
                dimensions=dims(
                    camp_id=camp.id, city_id=camp.city_id, client_id=camp.client_id,
                    vendor_id=vendors[0].id, channel="camp", business_model=camp.channel,
                    expense_id=e.id, source="camp",
                ),
            )
            exp_counter += 1

        # 20% of one employee salary allocated
        alloc = D(employees[0].monthly_salary) * D("0.20")
        post_transaction(
            db, org_id=org.id, user_id=founder.id, txn_date=camp.camp_date,
            txn_type="expense", amount=alloc, account_code="6000", contra_code="6000",
            description="Allocated ops salary", payment_status="paid",
            category="salaries", cost_nature="allocated",
            dimensions=dims(
                camp_id=camp.id, city_id=camp.city_id, client_id=camp.client_id,
                employee_id=employees[0].id, channel="camp", business_model=camp.channel, source="allocation",
            ),
            debit_account="6000", credit_account="6000",  # memo allocation — zero net COA, tracked on txn
        )
        # Fix: allocation should not zero itself. Post as expense against equity/clearing is wrong.
        # Skip balanced no-op. Use a dedicated allocated opex vs intercompany? Better: don't double count payroll.
        # Leave the allocated txn for camp P&L (cost_nature=allocated) — journal is a wash so cash/P&L company-level unchanged.

        if camp.channel == "b2b" and client:
            inv = Invoice(
                org_id=org.id, number=f"INV-2026-{inv_counter:04d}", client_id=client.id,
                camp_id=camp.id, city_id=camp.city_id, billing_address=client.billing_address,
                gstin=client.gstin, invoice_date=camp.camp_date,
                due_date=camp.camp_date + timedelta(days=30),
                subtotal=gross, tax_amount=tax, total=gross,
                amount_paid=D("0") if inv_counter % 3 else gross,
                payment_terms="Net 30", status="sent" if inv_counter % 3 else "paid",
                created_by=founder.id,
            )
            inv.items = [InvoiceItem(description=f"{pkg.name} x {attendees}", package_id=pkg.id,
                                     quantity=D(attendees), rate=unit, gst_rate=D("18"), amount=gross)]
            db.add(inv)
            db.flush()
            if inv.status == "paid":
                db.add(Payment(org_id=org.id, direction="in", payment_date=camp.camp_date + timedelta(days=12),
                               amount=gross, method="bank", invoice_id=inv.id, client_id=client.id,
                               reference=f"NEFT-{inv.number}"))
                inv.amount_paid = gross
                post_transaction(
                    db, org_id=org.id, user_id=founder.id, txn_date=camp.camp_date + timedelta(days=12),
                    txn_type="payment_in", amount=gross, account_code="1010", contra_code="1100",
                    description=f"Collection {inv.number}", payment_status="paid", payment_method="bank",
                    category="collections",
                    dimensions=dims(camp_id=camp.id, city_id=camp.city_id, client_id=client.id,
                                    invoice_id=inv.id, channel="b2b", business_model="b2b", source="invoice"),
                )
            elif inv_counter % 5 == 0:
                inv.status = "overdue"
            inv_counter += 1

    # Consultation revenue
    for i in range(24):
        d = date(today.year, today.month, 1) - timedelta(days=12 * i)
        post_transaction(
            db, org_id=org.id, user_id=founder.id, txn_date=d,
            txn_type="revenue", amount=D("1500"), account_code="4040", contra_code="1010",
            description="Nutrition consultation", payment_status="paid", payment_method="upi",
            category="consultation",
            dimensions=dims(city_id=cities[i % 5].id, channel="consultation", business_model="b2c", source="app",
                            customer_id=customers[i].id),
        )

    # Camp reimbursements — stay / travel / food per traveller
    camp_cats = [("stay", 4200), ("travel", 2800), ("food", 1100)]
    for i, emp in enumerate(employees[:6]):
        camp = camps[i % len(camps)]
        for j, (cat, base) in enumerate(camp_cats):
            amt = D(str(base + i * 150))
            paid = i < 4
            r = Reimbursement(
                org_id=org.id, employee_id=emp.id, claim_date=camp.camp_date,
                kind="camp", category=cat, amount=amt, camp_id=camp.id, client_id=camp.client_id,
                description=f"Camp reimbursement · {cat} · {emp.name} · {camp.name}",
                status="paid" if paid else "submitted",
            )
            db.add(r)
            if paid:
                post_transaction(
                    db, org_id=org.id, user_id=founder.id, txn_date=r.claim_date,
                    txn_type="reimbursement", amount=amt, account_code=CATEGORY_ACCOUNT.get(cat, "5040"),
                    contra_code="1010", description=r.description, payment_status="paid",
                    category=cat, cost_nature="direct",
                    dimensions=dims(employee_id=emp.id, camp_id=camp.id, city_id=camp.city_id,
                                    client_id=camp.client_id, channel="camp", source="reimbursement"),
                )

    # Monthly reimbursements — not charged to a camp
    for i, emp in enumerate(employees[:8]):
        amt = D(str(1800 + i * 200))
        r = Reimbursement(
            org_id=org.id, employee_id=emp.id, claim_date=today - timedelta(days=i * 3),
            kind="monthly", category="phone" if i % 2 == 0 else "internet", amount=amt,
            period_year=today.year, period_month=today.month,
            description=f"Monthly reimbursement · {'phone' if i % 2 == 0 else 'internet'} · {emp.name}",
            status="paid" if i < 5 else "submitted",
        )
        db.add(r)
        if r.status == "paid":
            post_transaction(
                db, org_id=org.id, user_id=founder.id, txn_date=r.claim_date,
                txn_type="reimbursement", amount=amt, account_code="6010", contra_code="1010",
                description=r.description, payment_status="paid", category="monthly",
                cost_nature="indirect",
                dimensions=dims(employee_id=emp.id, source="reimbursement"),
            )

    # Doctor & nutritionist payouts on camps
    for i, cl in enumerate(clinicians):
        camp = camps[i % len(camps)]
        cat = "doctors" if cl.kind == "doctor" else "nutritionists"
        n = db.scalar(select(func.count()).select_from(Expense).where(Expense.org_id == org.id)) or 0
        e = Expense(
            org_id=org.id, expense_number=f"EXP-{int(n)+1:04d}", expense_date=camp.camp_date,
            amount=cl.typical_fee, category=cat, cost_nature="direct", clinician_id=cl.id,
            camp_id=camp.id, city_id=camp.city_id, client_id=camp.client_id,
            description=f"{cl.kind.title()} payout · {cl.name} · {camp.name}",
            approval_status="approved", payment_status="paid", account_code=CATEGORY_ACCOUNT.get(cat, "5020"),
        )
        db.add(e)
        db.flush()
        post_transaction(
            db, org_id=org.id, user_id=founder.id, txn_date=e.expense_date,
            txn_type="cogs", amount=e.amount, account_code=e.account_code or "5020", contra_code="1010",
            description=e.description, payment_status="paid", category=cat, cost_nature="direct",
            dimensions=dims(camp_id=camp.id, city_id=camp.city_id, client_id=camp.client_id,
                            expense_id=e.id, channel="camp", source="clinician"),
        )

    db.add_all([
        Notification(org_id=org.id, user_id=founder.id, title="Overdue receivables",
                     body="Several B2B invoices are past due. Review the receivables ageing.", kind="warning"),
        Notification(org_id=org.id, user_id=founder.id, title="Camp ROI",
                     body="Delhi — Sierra Logistics ran a thin margin. Check diagnostic costs.", kind="info"),
        Notification(org_id=org.id, user_id=founder.id, title="Reimbursements pending",
                     body="3 employee reimbursements await finance review.", kind="info"),
    ])

    db.commit()
    return {"status": "seeded", "org_id": org.id, "login_phone": "9876543210", "dev_otp": "424242"}
