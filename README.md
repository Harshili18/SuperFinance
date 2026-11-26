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

# Frontend (second terminal)
cd frontend
npm run dev
```

Open http://localhost:5173

### First-time setup

```powershell
copy .env.example .env
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
cd ..\frontend
npm install
```

Edit `.env` as needed. **Never commit `.env`**, database files, or `storage/` uploads.

### Dev login

| Role | How |
|---|---|
| Founder | Mobile `9876543210` · OTP `424242` |
| Founder (email) | `founder@supersshyft.com` / `supersshyft` |
| Investor | `investor@supersshyft.com` / `investor` |

The OTP `424242` is **development-only**. Production mobile OTP is not integrated (API returns 501) until an SMS provider is connected — use email/password or add SMS.

Demo data seeds automatically on first API start in development. To regenerate: stop the API, delete `backend/superfinance.db`, start again.

## Production architecture

**Do not host the whole stack on Vercel alone.**

| Piece | Where |
|---|---|
| Frontend (Vite SPA) | Vercel (or any static host) — root directory `frontend` |
| Backend (FastAPI) | Persistent host: Docker / Railway / Render / Fly / Cloud Run / VPS |
| Database | PostgreSQL (managed or Compose) |
| Uploads | Durable volume or future object storage (`STORAGE_DIR`) |

### Backend env (set on the API host — never in GitHub)

| Variable | Production |
|---|---|
| `ENVIRONMENT` | `production` |
| `SECRET_KEY` | Strong random secret |
| `DATABASE_URL` | `postgresql+psycopg://…` |
| `CORS_ORIGINS` | Exact frontend origin(s), comma-separated |
| `FRONTEND_ORIGIN` | Primary frontend URL |
| `COOKIE_SECURE` | `true` (HTTPS) |
| `COOKIE_SAMESITE` | `lax` if FE and API share a site via reverse proxy; `none` if FE and API are on **different sites** |
| `STORAGE_DIR` | Persistent path |

Copy names from `.env.example`. Provide values via your host’s secret store / password manager.

Optional Compose (API + Postgres):

```powershell
# Set SECRET_KEY in the environment first
docker compose up --build
```

Compose defaults are **demo-only** (including DB password). Rotate before any shared use.

### Frontend on Vercel

1. Import the GitHub repo into Vercel.
2. **Root Directory:** `frontend`
3. **Build:** `npm run build` · **Output:** `dist`
4. Node **20.x** or **22.x**
5. SPA rewrites: `frontend/vercel.json` (already included)

Vercel hosts the **UI only**. Login calls `/api/v1/...` — without a backend those requests 404.

### Backend on Render (simple path)

1. [render.com](https://render.com) → **New → Blueprint** → connect this GitHub repo (`render.yaml`).
2. When prompted, set:
   - `CORS_ORIGINS` = your Vercel URL (e.g. `https://super-finance-five.vercel.app`)
   - `FRONTEND_ORIGIN` = same URL
3. Wait for `superfinance-api` to go live. Open `https://YOUR-API.onrender.com/api/v1/health` — should return `ok`.
4. In **Vercel → Project → Settings → Environment Variables** add:
   - `VITE_API_BASE_URL` = `https://YOUR-API.onrender.com` (no trailing slash)
5. **Redeploy** the Vercel project (required so the build picks up the env var).
6. Sign in with the seeded demo email/password from the README (enabled via `ALLOW_INITIAL_SEED` on first empty DB).

**API routing (pick one):**

**A — Recommended same-site proxy:** put `https://yourdomain.com/api` → FastAPI (nginx / Cloudflare / Vercel rewrite to API URL). Leave `VITE_API_BASE_URL` empty so the SPA keeps relative `/api` calls.

**B — Split origins (Vercel + Render):** set Vercel `VITE_API_BASE_URL` as above; API uses `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none`.

Template: `frontend/.env.example`.

### Production checklist

1. Postgres provisioned; `DATABASE_URL` set on API host  
2. Strong `SECRET_KEY`; `ENVIRONMENT=production`  
3. `COOKIE_SECURE=true` (+ `COOKIE_SAMESITE` as above)  
4. FE deployed; CORS origins match  
5. Auth plan: email/password users in DB (seed is **off** in production) — or implement SMS  
6. Durable `STORAGE_DIR`  
7. Smoke-test: login, dashboard, expense, upload, invoice PDF  

Never expose `/api/docs` publicly without auth (docs are disabled when `ENVIRONMENT=production`).

## Secrets hygiene

```powershell
.\scripts\check-no-secrets.ps1
```

Before every commit/push: confirm `.env`, `*.db`, and `storage/` are **not** staged. They are gitignored by default.
