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

  async function loginEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      nav("/overview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  const field = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg text-card-foreground">
        <Link to="/" className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          SUPERFINANCE
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight">Finance & MIS workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to see camp profitability, margins and cash flow.</p>

        <div className="mt-6 inline-flex h-9 w-full items-center rounded-lg bg-muted p-1 text-muted-foreground">
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1 text-sm font-medium ${mode === "email" ? "bg-background text-foreground shadow-xs" : ""}`}
            onClick={() => setMode("email")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1 text-sm font-medium ${mode === "otp" ? "bg-background text-foreground shadow-xs" : ""}`}
            onClick={() => setMode("otp")}
          >
            Mobile OTP
          </button>
        </div>

        {error ? <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
        {hint ? <div className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm">{hint}</div> : null}

        {mode === "email" ? (
          <form onSubmit={loginEmail} className="mt-4 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              Work email
              <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Password
              <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button disabled={busy} className="h-9 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : null}

        {mode === "otp" && step === "request" ? (
          <form onSubmit={requestOtp} className="mt-4 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              Mobile number
              <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <button disabled={busy} className="h-9 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : null}

        {mode === "otp" && step === "verify" ? (
          <form onSubmit={verify} className="mt-4 space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              OTP
              <input className={field} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Development OTP" />
            </label>
            <button disabled={busy} className="h-9 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              {busy ? "Verifying…" : "Verify & continue"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
