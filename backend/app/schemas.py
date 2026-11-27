from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class OtpRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=15)


class OtpVerify(BaseModel):
    phone: str
    code: str = Field(min_length=4, max_length=8)


class PasswordLogin(BaseModel):
    email: str
    password: str


class UserOut(ORM):
    id: str
    name: str
    email: str | None
    phone: str | None
    role: str
    theme: str
    org_id: str


class IdName(ORM):
    id: str
    name: str


class CampIn(BaseModel):
    name: str
    client_id: str | None = None
    city_id: str | None = None
    location: str | None = None
    camp_date: date
    start_time: str | None = None
    end_time: str | None = None
    camp_type: str = "corporate"
    channel: str = "b2b"
    expected_attendees: int = 0
    actual_attendees: int = 0
    expected_revenue: Decimal = 0
    budget: Decimal = 0
    status: str = "planned"
    notes: str | None = None


class PackageCostIn(BaseModel):
    cost_type: str
    amount: Decimal
    diagnostic_partner_id: str | None = None


class PackageIn(BaseModel):
    code: str
    name: str
    category: str = "health"
    description: str | None = None
    selling_price: Decimal
    gst_rate: Decimal = 18
    is_active: bool = True
    costs: list[PackageCostIn] = []


class ClientIn(BaseModel):
    name: str
    legal_name: str | None = None
    gstin: str | None = None
    billing_address: str | None = None
    city_id: str | None = None
    industry: str | None = None
    payment_terms_days: int = 30
    notes: str | None = None


class ExpenseIn(BaseModel):
    expense_date: date
    amount: Decimal
    tax_amount: Decimal = 0
    category: str
    subcategory: str | None = None
    cost_nature: str = "indirect"
    vendor_id: str | None = None
    employee_id: str | None = None
    camp_id: str | None = None
    client_id: str | None = None
    city_id: str | None = None
    diagnostic_partner_id: str | None = None
    clinician_id: str | None = None
    package_id: str | None = None
    payment_method: str | None = None
    description: str | None = None


class InvoiceItemIn(BaseModel):
    description: str
    package_id: str | None = None
    quantity: Decimal = 1
    rate: Decimal
    discount: Decimal = 0
    gst_rate: Decimal = 18


class InvoiceIn(BaseModel):
    client_id: str
    camp_id: str | None = None
    city_id: str | None = None
    billing_address: str | None = None
    gstin: str | None = None
    invoice_date: date
    due_date: date
    payment_terms: str | None = "Net 30"
    notes: str | None = None
    items: list[InvoiceItemIn]


class PaymentIn(BaseModel):
    direction: str = "in"
    payment_date: date
    amount: Decimal
    method: str = "bank"
    invoice_id: str | None = None
    expense_id: str | None = None
    client_id: str | None = None
    vendor_id: str | None = None
    partner_id: str | None = None
    reference: str | None = None


class PartnerIn(BaseModel):
    name: str
    partner_type: str = "lab"
    city_id: str | None = None
    contact: str | None = None
    gstin: str | None = None
    payment_terms_days: int = 21
    bank_details: str | None = None


class EmployeeIn(BaseModel):
    employee_code: str
    name: str
    department: str | None = None
    designation: str | None = None
    joining_date: date | None = None
    monthly_salary: Decimal = 0
    ctc: Decimal = 0
    city_id: str | None = None


class ReimbursementIn(BaseModel):
    employee_id: str
    claim_date: date
    kind: str = "monthly"  # camp | monthly
    category: str
    amount: Decimal
    description: str | None = None
    camp_id: str | None = None
    client_id: str | None = None
    period_year: int | None = None
    period_month: int | None = None


class CampTravellerIn(BaseModel):
    employee_id: str
    claim_date: date
    stay: Decimal = 0
    travel: Decimal = 0
    food: Decimal = 0
    other: Decimal = 0


class ClinicianIn(BaseModel):
    name: str
    kind: str  # doctor | nutritionist
    specialty: str | None = None
    phone: str | None = None
    typical_fee: Decimal = 0


class ClinicianPayoutIn(BaseModel):
    payout_date: date
    amount: Decimal
    camp_id: str | None = None
    description: str | None = None


class RevenueIn(BaseModel):
    txn_date: date
    amount: Decimal
    tax_amount: Decimal = 0
    discount_amount: Decimal = 0
    channel: str = "b2b"
    business_model: str | None = None
    camp_id: str | None = None
    city_id: str | None = None
    client_id: str | None = None
    customer_id: str | None = None
    package_id: str | None = None
    diagnostic_partner_id: str | None = None
    payment_status: str = "paid"
    payment_method: str | None = "upi"
    description: str | None = None
    source: str | None = None


class ScenarioIn(BaseModel):
    discount_pct: Decimal | None = None
    selling_price: Decimal | None = None
    partner_cost_increase_pct: Decimal | None = None


class ThemeIn(BaseModel):
    theme: str


class OpeningBalanceIn(BaseModel):
    entry_date: date
    account_code: str = "1010"  # 1000 cash / 1010 bank
    amount: Decimal
    note: str | None = None
    reference: str | None = None


class QueryFilters(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    city_id: str | None = None
    client_id: str | None = None
    camp_id: str | None = None
    package_id: str | None = None
    channel: str | None = None
    business_model: str | None = None
    diagnostic_partner_id: str | None = None
    group_by: str = "city"
