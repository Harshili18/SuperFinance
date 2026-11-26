import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { delta, inr, pct } from "../lib/format";
import type { Kpi } from "../lib/api";

export function KpiCard({
  label,
  kpi,
  format = "money",
  suffix,
  sub,
  featured = false,
}: {
  label: string;
  kpi: Kpi | { value: number; previous?: number | null; change_pct?: number | null };
  format?: "money" | "pct" | "number";
  suffix?: string;
  sub?: string;
  featured?: boolean;
}) {
  const display =
    format === "money" ? inr(kpi.value) : format === "pct" ? pct(kpi.value) : `${kpi.value}${suffix || ""}`;
  const ch = kpi.change_pct;
  const up = (ch ?? 0) >= 0;
  const Tone = ch === null || ch === undefined ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const negativeValue = kpi.value < 0;

  if (featured) {
    return (
      <div className="kpi-featured min-w-0 p-3.5">
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-primary-foreground/70">{label}</p>
        <p className="num mt-1.5 truncate text-xl font-bold tracking-tight md:text-2xl">{display}</p>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px]">
          {ch !== null && ch !== undefined ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/15 px-2 py-0.5 font-semibold text-primary-foreground">
              <Tone className="size-3" />
              {delta(ch)}
            </span>
          ) : null}
          <span className="truncate text-primary-foreground/65">{sub || (ch != null ? "vs prior period" : "Current period")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card min-w-0 p-3">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`num mt-1 truncate text-lg font-semibold tracking-tight md:text-xl ${negativeValue ? "text-negative" : "text-foreground"}`}>
        {display}
      </p>
      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px]">
        {ch !== null && ch !== undefined ? (
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
              up ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
            }`}
          >
            <Tone className="size-3" />
            {delta(ch)}
          </span>
        ) : null}
        <span className="truncate text-muted-foreground">{sub || (ch != null ? "vs prior" : "Current period")}</span>
      </div>
    </div>
  );
}
