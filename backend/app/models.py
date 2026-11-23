from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

MONEY = Numeric(14, 2)


def uid() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    legal_name: Mapped[str] = mapped_column(String(200), default="SUPERSSHYFT")
    gstin: Mapped[str | None] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(200), index=True)
    phone: Mapped[str | None] = mapped_column(String(20), index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(40), default="viewer")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    theme: Mapped[str] = mapped_column(String(10), default="light")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    phone: Mapped[str] = mapped_column(String(20), index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class City(Base):
    __tablename__ = "cities"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Client(Base):
    __tablename__ = "clients"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    legal_name: Mapped[str | None] = mapped_column(String(200))
    gstin: Mapped[str | None] = mapped_column(String(20))
    billing_address: Mapped[str | None] = mapped_column(Text)
    city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id"))
    industry: Mapped[str | None] = mapped_column(String(80))
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[str] = mapped_column(String(20), default="active")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Customer(Base):
    """B2C customer reference only — no clinical data."""
    __tablename__ = "customers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(80), index=True)
    display_name: Mapped[str] = mapped_column(String(120), default="Customer")
    city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id"))
    channel: Mapped[str] = mapped_column(String(40), default="app")


class Vendor(Base):
    __tablename__ = "vendors"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    category: Mapped[str | None] = mapped_column(String(80))
    gstin: Mapped[str | None] = mapped_column(String(20))
    city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id"))
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=15)
    bank_details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")


class Clinician(Base):
    """Doctors and nutritionists we pay — not on payroll."""
    __tablename__ = "clinicians"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)  # doctor | nutritionist
    specialty: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20))
    typical_fee: Mapped[Decimal] = mapped_column(MONEY, default=0)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DiagnosticPartner(Base):
    __tablename__ = "diagnostic_partners"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    partner_type: Mapped[str] = mapped_column(String(80), default="lab")
    city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id"))
    contact: Mapped[str | None] = mapped_column(String(120))
    gstin: Mapped[str | None] = mapped_column(String(20))
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=21)
    bank_details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    employee_code: Mapped[str] = mapped_column(String(40), index=True)
    name: Mapped[str] = mapped_column(String(120))
    department: Mapped[str | None] = mapped_column(String(80))
    designation: Mapped[str | None] = mapped_column(String(80))
    joining_date: Mapped[date | None] = mapped_column(Date)
    monthly_salary: Mapped[Decimal] = mapped_column(MONEY, default=0)
    ctc: Mapped[Decimal] = mapped_column(MONEY, default=0)
    variable_pay: Mapped[Decimal] = mapped_column(MONEY, default=0)
    city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id"))
    status: Mapped[str] = mapped_column(String(20), default="active")


class Package(Base):
    __tablename__ = "packages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    code: Mapped[str] = mapped_column(String(40), index=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80), default="health")
    description: Mapped[str | None] = mapped_column(Text)
    selling_price: Mapped[Decimal] = mapped_column(MONEY)
    gst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=18)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    costs: Mapped[list[PackageCost]] = relationship(back_populates="package", cascade="all, delete-orphan")


class PackageCost(Base):
    __tablename__ = "package_costs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    package_id: Mapped[str] = mapped_column(ForeignKey("packages.id"), index=True)
    cost_type: Mapped[str] = mapped_column(String(40))  # diagnostic, consultation, operations, gateway, other
    amount: Mapped[Decimal] = mapped_column(MONEY)
    diagnostic_partner_id: Mapped[str | None] = mapped_column(ForeignKey("diagnostic_partners.id"))
    package: Mapped[Package] = relationship(back_populates="costs")


class PartnerPrice(Base):
    __tablename__ = "partner_prices"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    partner_id: Mapped[str] = mapped_column(ForeignKey("diagnostic_partners.id"), index=True)
    package_id: Mapped[str | None] = mapped_column(ForeignKey("packages.id"))
    test_name: Mapped[str] = mapped_column(String(160))
    partner_cost: Mapped[Decimal] = mapped_column(MONEY)
    selling_price: Mapped[Decimal] = mapped_column(MONEY)


class Camp(Base):
    __tablename__ = "camps"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    camp_number: Mapped[str] = mapped_column(String(40), index=True)
    name: Mapped[str] = mapped_column(String(200))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), index=True)
    city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id"), index=True)
    location: Mapped[str | None] = mapped_column(String(200))
    camp_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[str | None] = mapped_column(String(10))
    end_time: Mapped[str | None] = mapped_column(String(10))
    camp_type: Mapped[str] = mapped_column(String(40), default="corporate")
    channel: Mapped[str] = mapped_column(String(20), default="b2b")  # b2b | b2c
    expected_attendees: Mapped[int] = mapped_column(Integer, default=0)
    actual_attendees: Mapped[int] = mapped_column(Integer, default=0)
    expected_revenue: Mapped[Decimal] = mapped_column(MONEY, default=0)
    budget: Mapped[Decimal] = mapped_column(MONEY, default=0)
    status: Mapped[str] = mapped_column(String(20), default="planned", index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    client: Mapped[Client | None] = relationship()
    city: Mapped[City | None] = relationship()


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("org_id", "code"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    code: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(20), index=True)  # asset, liability, equity, revenue, cogs, opex
    parent_code: Mapped[str | None] = mapped_column(String(20))
    is_cash: Mapped[bool] = mapped_column(Boolean, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AccountingPeriod(Base):
    __tablename__ = "accounting_periods"
    __table_args__ = (UniqueConstraint("org_id", "year", "month"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | locked


class Transaction(Base):
    """Source of truth for MIS. Posted rows only feed dashboards."""
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_txn_org_date", "org_id", "txn_date"),
        Index("ix_txn_org_camp", "org_id", "camp_id"),
        Index("ix_txn_org_client", "org_id", "client_id"),
        Index("ix_txn_org_type", "org_id", "txn_type"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    txn_date: Mapped[date] = mapped_column(Date, index=True)
    txn_type: Mapped[str] = mapped_column(String(40), index=True)  # revenue, cogs, expense, payment_in, payment_out, refund, payroll, reimbursement, transfer
    amount: Mapped[Decimal] = mapped_column(MONEY)  # gross
    tax_amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    discount_amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    net_amount: Mapped[Decimal] = mapped_column(MONEY)
    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    payment_method: Mapped[str | None] = mapped_column(String(40))
    account_code: Mapped[str] = mapped_column(String(20), index=True)
    category: Mapped[str | None] = mapped_column(String(80), index=True)
    subcategory: Mapped[str | None] = mapped_column(String(80))
    cost_nature: Mapped[str | None] = mapped_column(String(20))  # direct, indirect, allocated
    description: Mapped[str | None] = mapped_column(Text)
    reference: Mapped[str | None] = mapped_column(String(80), index=True)
    camp_id: Mapped[str | None] = mapped_column(ForeignKey("camps.id"), index=True)
    city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id"), index=True)
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), index=True)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id"))
    package_id: Mapped[str | None] = mapped_column(ForeignKey("packages.id"), index=True)
    diagnostic_partner_id: Mapped[str | None] = mapped_column(ForeignKey("diagnostic_partners.id"), index=True)
    vendor_id: Mapped[str | None] = mapped_column(ForeignKey("vendors.id"), index=True)
    employee_id: Mapped[str | None] = mapped_column(ForeignKey("employees.id"), index=True)
    channel: Mapped[str | None] = mapped_column(String(40), index=True)  # b2b, b2c, app, camp, consultation
    business_model: Mapped[str | None] = mapped_column(String(10))  # b2b, b2c
    source: Mapped[str | None] = mapped_column(String(40))
    invoice_id: Mapped[str | None] = mapped_column(String(36), index=True)
    expense_id: Mapped[str | None] = mapped_column(String(36), index=True)
    status: Mapped[str] = mapped_column(String(20), default="posted", index=True)  # draft, posted, void, cancelled
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    memo: Mapped[str | None] = mapped_column(String(255))
    source_transaction_id: Mapped[str | None] = mapped_column(ForeignKey("transactions.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="posted")
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    lines: Mapped[list[JournalLine]] = relationship(back_populates="entry", cascade="all, delete-orphan")


class JournalLine(Base):
    __tablename__ = "journal_lines"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    entry_id: Mapped[str] = mapped_column(ForeignKey("journal_entries.id"), index=True)
    account_code: Mapped[str] = mapped_column(String(20), index=True)
    debit: Mapped[Decimal] = mapped_column(MONEY, default=0)
    credit: Mapped[Decimal] = mapped_column(MONEY, default=0)
    entry: Mapped[JournalEntry] = relationship(back_populates="lines")


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    number: Mapped[str] = mapped_column(String(40), index=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    camp_id: Mapped[str | None] = mapped_column(ForeignKey("camps.id"))
    city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id"))
    billing_address: Mapped[str | None] = mapped_column(Text)
    gstin: Mapped[str | None] = mapped_column(String(20))
    invoice_date: Mapped[date] = mapped_column(Date, index=True)
    due_date: Mapped[date] = mapped_column(Date, index=True)
    subtotal: Mapped[Decimal] = mapped_column(MONEY, default=0)
    discount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    total: Mapped[Decimal] = mapped_column(MONEY, default=0)
    amount_paid: Mapped[Decimal] = mapped_column(MONEY, default=0)
    payment_terms: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    items: Mapped[list[InvoiceItem]] = relationship(back_populates="invoice", cascade="all, delete-orphan")
    client: Mapped[Client] = relationship()


class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id"), index=True)
    description: Mapped[str] = mapped_column(String(255))
    package_id: Mapped[str | None] = mapped_column(ForeignKey("packages.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=1)
    rate: Mapped[Decimal] = mapped_column(MONEY)
    discount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    gst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=18)
    amount: Mapped[Decimal] = mapped_column(MONEY)
    invoice: Mapped[Invoice] = relationship(back_populates="items")


class Expense(Base):
    __tablename__ = "expenses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    expense_number: Mapped[str] = mapped_column(String(40), index=True)
    expense_date: Mapped[date] = mapped_column(Date, index=True)
    amount: Mapped[Decimal] = mapped_column(MONEY)
    tax_amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    category: Mapped[str] = mapped_column(String(80), index=True)
    subcategory: Mapped[str | None] = mapped_column(String(80))
    cost_nature: Mapped[str] = mapped_column(String(20), default="indirect")
    vendor_id: Mapped[str | None] = mapped_column(ForeignKey("vendors.id"))
    employee_id: Mapped[str | None] = mapped_column(ForeignKey("employees.id"))
    camp_id: Mapped[str | None] = mapped_column(ForeignKey("camps.id"), index=True)
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"))
    city_id: Mapped[str | None] = mapped_column(ForeignKey("cities.id"))
    diagnostic_partner_id: Mapped[str | None] = mapped_column(ForeignKey("diagnostic_partners.id"))
    clinician_id: Mapped[str | None] = mapped_column(ForeignKey("clinicians.id"), index=True)
    package_id: Mapped[str | None] = mapped_column(ForeignKey("packages.id"))
    payment_method: Mapped[str | None] = mapped_column(String(40))
    description: Mapped[str | None] = mapped_column(Text)
    approval_status: Mapped[str] = mapped_column(String(30), default="submitted", index=True)
    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    account_code: Mapped[str | None] = mapped_column(String(20))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Reimbursement(Base):
    __tablename__ = "reimbursements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    claim_date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(20), default="monthly", index=True)  # camp | monthly
    category: Mapped[str] = mapped_column(String(80))  # stay, travel, food, phone, other
    amount: Mapped[Decimal] = mapped_column(MONEY)
    description: Mapped[str | None] = mapped_column(Text)
    camp_id: Mapped[str | None] = mapped_column(ForeignKey("camps.id"), index=True)
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"))
    period_year: Mapped[int | None] = mapped_column(Integer)
    period_month: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="submitted", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SalaryRecord(Base):
    __tablename__ = "salary_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    period_year: Mapped[int] = mapped_column(Integer)
    period_month: Mapped[int] = mapped_column(Integer)
    gross: Mapped[Decimal] = mapped_column(MONEY)
    employer_cost: Mapped[Decimal] = mapped_column(MONEY, default=0)
    camp_id: Mapped[str | None] = mapped_column(ForeignKey("camps.id"))
    allocation_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="posted")


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    direction: Mapped[str] = mapped_column(String(10))  # in | out
    payment_date: Mapped[date] = mapped_column(Date, index=True)
    amount: Mapped[Decimal] = mapped_column(MONEY)
    method: Mapped[str] = mapped_column(String(40), default="bank")
    invoice_id: Mapped[str | None] = mapped_column(ForeignKey("invoices.id"), index=True)
    expense_id: Mapped[str | None] = mapped_column(ForeignKey("expenses.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"))
    vendor_id: Mapped[str | None] = mapped_column(ForeignKey("vendors.id"))
    partner_id: Mapped[str | None] = mapped_column(ForeignKey("diagnostic_partners.id"))
    reference: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Budget(Base):
    __tablename__ = "budgets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(80))
    amount: Mapped[Decimal] = mapped_column(MONEY)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    tags: Mapped[str | None] = mapped_column(String(255))
    uploaded_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(40), default="info")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    before: Mapped[str | None] = mapped_column(Text)
    after: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
