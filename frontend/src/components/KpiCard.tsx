import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { delta, inr, pct } from "../lib/format";
import type { Kpi } from "../lib/api";

export function KpiCard({
  label,
  kpi,
  format = "money",
  suffix,
  sub,
}: {
  label: string;
  kpi: Kpi | { value: number; previous?: number | null; change_pct?: number | null };
  format?: "money" | "pct" | "number";
  suffix?: string;
  sub?: string;
}) {
  const display =
    format === "money" ? inr(kpi.value) : format === "pct" ? pct(kpi.value) : `${kpi.value}${suffix || ""}`;
  const ch = kpi.change_pct;
  const up = (ch ?? 0) >= 0;
  const Tone = ch === null || ch === undefined ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const tone = kpi.value < 0 ? "negative" : undefined;
  return (
    <div className="min-w-0 rounded-md border border-border bg-card p-3 shadow-xs">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={`num mt-1 truncate text-lg font-bold md:text-xl ${tone === "negative" ? "text-negative" : ""}`}>{display}</p>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]">
        {ch !== null && ch !== undefined ? (
          <span className={`inline-flex shrink-0 items-center gap-0.5 font-semibold ${up ? "text-positive" : "text-negative"}`}>
            <Tone className="size-3" />
            {delta(ch)}
          </span>
        ) : null}
        <span className="truncate text-muted-foreground">{sub || (ch != null ? "vs prior" : "Current period")}</span>
      </div>
    </div>
  );
}
