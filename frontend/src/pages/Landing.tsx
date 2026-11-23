import { Activity, BarChart3, Shield } from "lucide-react";
import { Link } from "react-router-dom";

export function Landing() {
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="text-sm font-extrabold tracking-tight">SUPERFINANCE</div>
        <Link to="/login" className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#063533]">
          Sign in
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight md:text-5xl">
          Every rupee, mapped to the camp, city and client that earned it.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-sidebar-foreground/70 md:text-base">
          One ledger behind every dashboard: camp-level profitability, package margins, partner payouts,
          receivables and a monthly P&L that closes itself — no Excel gymnastics.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/login" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[#063533]">
            Open the workspace
          </Link>
          <Link
            to="/login"
            className="rounded-md border border-sidebar-border px-4 py-2.5 text-sm font-semibold text-sidebar-foreground"
          >
            View dashboard
          </Link>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            { icon: Activity, title: "Camp P&L", body: "Revenue, partner cost and profit for every camp you run." },
            { icon: BarChart3, title: "MIS on tap", body: "Margins by package, city and channel, refreshed as entries land." },
            { icon: Shield, title: "Role-based access", body: "Founder, finance, ops and viewer roles see exactly what they should." },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-5">
              <f.icon className="size-5 text-sidebar-primary" />
              <h2 className="mt-3 text-base font-bold">{f.title}</h2>
              <p className="mt-1 text-sm text-sidebar-foreground/65">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
