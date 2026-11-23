# SUPERFINANCE

Finance · MIS · Operations · Profitability for **SUPERSSHYFT**.

React (Vite) frontend. FastAPI backend. PostgreSQL in production, SQLite for local demo. Dashboards are derived from a posted transaction ledger — not hardcoded cards.

Blueprint: [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md)

## Run locally

You need **Python 3.12+** and **Node 20+**.

```powershell
# After the first setup (venv + npm install):
.\scripts\start.ps1
```

Or manually:

```powershell
# Backend
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Frontend (second terminal) — add portable Node to PATH if needed
cd frontend
npm run dev
```

Open http://localhost:5173

### Dev login

| Role | How |
|---|---|
| Founder | Mobile `9876543210` · OTP `424242` |
| Founder (email) | `founder@supersshyft.com` / `supersshyft` |
| Investor | `investor@supersshyft.com` / `investor` |

The OTP `424242` is **development-only**. Production must use a real SMS provider.

Demo data (12 months of camps, packages, invoices, expenses) seeds automatically on first API start. Opening cash is ₹3.5Cr so payroll and camp costs leave a positive runway. To regenerate: stop the API, delete `backend/superfinance.db`, start again.

## Production

Set `ENVIRONMENT=production`, a strong `SECRET_KEY`, and:

```
DATABASE_URL=postgresql+psycopg://user:pass@host:5432/superfinance
```

Use `docker compose up --build` when Docker is available.

Never expose the FastAPI docs in a public deployment without auth. Rotate secrets. Put the API behind HTTPS and set `COOKIE_SECURE=true`.
