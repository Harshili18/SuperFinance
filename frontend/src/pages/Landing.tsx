import { Activity, BarChart3, Shield } from "lucide-react";
import { Link } from "react-router-dom";

export function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,_rgba(15,107,76,0.14),_transparent_60%)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">S</span>
          <span className="text-sm font-bold tracking-tight">SuperFinance</span>
        </div>
        <Link to="/login" className="btn-primary">
          Sign in
        </Link>
      </header>
      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Finance · MIS · Operations</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight md:text-5xl md:leading-[1.1]">
          Every rupee, mapped to the camp, city and client that earned it.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          One ledger behind every dashboard: camp-level profitability, package margins, partner payouts,
          receivables and a monthly P&L that closes itself — no Excel gymnastics.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/login" className="btn-primary h-11 px-5">
            Open the workspace
          </Link>
          <Link to="/login" className="btn-secondary h-11 px-5">
            View dashboard
          </Link>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            { icon: Activity, title: "Camp P&L", body: "Revenue, partner cost and profit for every camp you run." },
            { icon: BarChart3, title: "MIS on tap", body: "Margins by package, city and channel, refreshed as entries land." },
            { icon: Shield, title: "Role-based access", body: "Founder, finance, ops and viewer roles see exactly what they should." },
          ].map((f) => (
            <div key={f.title} className="surface-card p-5">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" strokeWidth={1.75} />
              </span>
              <h2 className="mt-4 text-base font-semibold tracking-tight">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
