# SUPERFINANCE — Technical Blueprint

Finance OS for SUPERSSHYFT. Dashboards are derived views. The ledger is the source of truth.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind |
| Backend | FastAPI + SQLAlchemy 2 + Pydantic v2 |
| Database | PostgreSQL (SQLite allowed for local demo) |
| Auth | Phone OTP + email/password, JWT httpOnly cookies |
| Files | Local/object storage paths — never DB blobs |

## Architecture

```
React SPA  →  FastAPI  →  PostgreSQL
                │
                ├── services/ledger.py     post balanced journal entries
                ├── services/finance.py    ALL KPIs / P&L / ROI (server-side)
                ├── services/insights.py   explanations from real aggregates
                └── storage/               receipts, invoices, contracts
```

Three experiences, one database:

1. **Finance OS** — invoices, expenses, approvals, GST, documents
2. **Management MIS** — camp / package / city / client profitability
3. **Investor view** — growth, margin, EBITDA, burn, runway (read-only)

## Transaction model

Every posted financial event becomes:

1. A **source document** (invoice, expense, reimbursement, salary, bill)
2. A **transaction** row with business dimensions
3. A **balanced journal entry** (debits = credits)

Dimensions on every transaction: time, city, camp, client, customer, package, channel, B2B/B2C, diagnostic partner, employee, vendor, revenue/expense type.

Formulas live only in `services/finance.py`. UI never invents totals.

## Security

- JWT in httpOnly cookies, SameSite=Lax
- RBAC on every mutation
- Period lock blocks posting
- Soft void/cancel — no hard-delete of posted money
- Audit log on amount/status changes
- Hashed OTPs, rate-limited auth
- Dev OTP `424242` only when `ENVIRONMENT=development`
- Path-safe uploads, size limits, signed-style download via auth

## Implementation phases

1. Foundation: schema, auth, shell, executive dashboard
2. Ledger: revenue, expenses, COA, posting
3. Signature: camps, packages, diagnostic partners, camp P&L, ROI
4. Commercial: clients, invoices, AR/AP, payments
5. People: employees, salary tracking, reimbursements
6. App revenue, budgets, cash flow
7. MIS + investor + profitability explorer
8. Documents, CSV/Excel import, AI insight stubs

Clinical/PHI stays out of this database. Finance stores customer/order IDs only.
