import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";

export function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"otp" | "email">("email");
  const [phone, setPhone] = useState("9876543210");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("founder@supersshyft.com");
  const [password, setPassword] = useState("supersshyft");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"request" | "verify">("request");

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ dev_otp?: string; message: string }>("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setHint(res.dev_otp ? `Development OTP: ${res.dev_otp}` : res.message);
      setStep("verify");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code }) });
      nav("/overview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify OTP.");
    } finally {
      setBusy(false);
    }
  }

  function loginErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 404 || err.status === 502 || err.status === 503) {
        return "API is not connected yet. The Vercel site is frontend-only — deploy the FastAPI backend and set VITE_API_BASE_URL (or an /api rewrite).";
      }
      return err.message;
    }
    return "Could not sign in. Check that the API is running and reachable.";
  }

  async function loginEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      nav("/overview");
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field =
    "flex h-10 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm outline-none transition focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(15,107,76,0.12),_transparent_55%)]" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
      <div className="relative w-full max-w-md rounded-3xl border border-border/80 bg-card p-7 text-card-foreground shadow-soft">
        <Link to="/" className="inline-flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">S</span>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">SuperFinance</span>
        </Link>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Sign in to see camp profitability, margins and cash flow.</p>

        <div className="mt-6 inline-flex h-10 w-full items-center rounded-xl bg-muted p-1 text-muted-foreground">
          <button
            type="button"
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${mode === "email" ? "bg-card text-foreground shadow-xs" : ""}`}
            onClick={() => setMode("email")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${mode === "otp" ? "bg-card text-foreground shadow-xs" : ""}`}
            onClick={() => setMode("otp")}
          >
            Mobile OTP
          </button>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-negative/25 bg-negative/10 px-3 py-2.5 text-sm text-negative">{error}</div> : null}
        {hint ? <div className="mt-4 rounded-xl border border-border bg-muted px-3 py-2.5 text-sm">{hint}</div> : null}

        {mode === "email" ? (
          <form onSubmit={loginEmail} className="mt-5 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              Work email
              <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Password
              <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button disabled={busy} className="btn-primary h-10 w-full">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : null}

        {mode === "otp" && step === "request" ? (
          <form onSubmit={requestOtp} className="mt-5 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              Mobile number
              <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <button disabled={busy} className="btn-primary h-10 w-full">
              {busy ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : null}

        {mode === "otp" && step === "verify" ? (
          <form onSubmit={verify} className="mt-5 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              OTP
              <input className={field} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Development OTP" />
            </label>
            <button disabled={busy} className="btn-primary h-10 w-full">
              {busy ? "Verifying…" : "Verify & continue"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
