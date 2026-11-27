import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, type Kpi } from "../lib/api";
import { toQuery, useFilters } from "../lib/filters";
import { delta, inr, pct } from "../lib/format";
import { MoneyBars, MoneyLine, Panel } from "../components/Charts";
import { PageHeader } from "../components/AppShell";

type Attention = { text: string; to: string; kind?: string };

type Dash = {
  revenue: Kpi;
  gross_profit: Kpi;
  gross_margin: Kpi;
  operating_expenses: Kpi;
  ebitda: Kpi;
  net_profit: Kpi;
  cash_balance: Kpi;
  receivables: Kpi;
  payables: Kpi;
  burn_rate: Kpi;
  runway_months: number | null;
  charts: {
    monthly_revenue: { month: string; amount: number }[];
    monthly_expense: { month: string; amount: number }[];
    by_city: { key: string; label?: string; amount: number }[];
  };
  attention: Attention[];
};

type AttentionRow = {
  key: string;
  title: string;
  detail: string;
  to: string;
  tone: "critical" | "warn";
};

function formatValue(kpi: Kpi, format: "money" | "pct" | "number" = "money", suffix = "") {
  if (format === "pct") return pct(kpi.value);
  if (format === "number") return `${kpi.value}${suffix}`;
  return inr(kpi.value);
}

function TrendBadge({ kpi }: { kpi: Kpi }) {
  const ch = kpi.change_pct;
  if (ch === null || ch === undefined) return null;
  const up = ch >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        up ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
      }`}
    >
      <Icon className="size-3" />
      {delta(ch)}
    </span>
  );
}

function HeroMetric({
  label,
  kpi,
  format = "money",
  emphasize,
  onClick,
}: {
  label: string;
  kpi: Kpi;
  format?: "money" | "pct";
  emphasize?: boolean;
  onClick?: () => void;
}) {
  const negative = kpi.value < 0;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`min-w-0 text-left ${onClick ? "rounded-xl transition hover:bg-white/50" : ""} ${emphasize ? "sm:pr-2" : ""}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p
        className={`num mt-1.5 truncate font-bold tracking-tight ${
          emphasize ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"
        } ${negative ? "text-negative" : "text-foreground"}`}
      >
        {formatValue(kpi, format)}
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <TrendBadge kpi={kpi} />
        {chLabel(kpi)}
      </div>
    </Tag>
  );
}

function chLabel(kpi: Kpi) {
  if (kpi.change_pct === null || kpi.change_pct === undefined) {
    return <span className="text-[11px] text-muted-foreground">Current period</span>;
  }
  return <span className="text-[11px] text-muted-foreground">vs prior</span>;
}

function PositionTile({
  label,
  value,
  onClick,
  negative,
  title,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  negative?: boolean;
  title?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={`rounded-xl bg-surface-soft px-2.5 py-2 text-left transition ${onClick ? "hover:bg-muted" : ""}`}
    >
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`num mt-0.5 truncate text-sm font-semibold tracking-tight ${negative ? "text-negative" : "text-foreground"}`}>
        {value}
      </p>
    </Tag>
  );
}

function buildAttentionRows(items: Attention[]): AttentionRow[] {
  const rows: AttentionRow[] = [];
  const losses = items.filter((i) => i.kind === "loss_camp");
  const rest = items.filter((i) => i.kind !== "loss_camp");

  for (const item of rest) {
    if (item.kind === "overdue_invoices") {
      rows.push({
        key: item.kind,
        title: "Overdue invoices",
        detail: item.text,
        to: item.to,
        tone: "critical",
      });
    } else if (item.kind === "vendor_payables") {
      rows.push({
        key: item.kind,
        title: "Unpaid vendor bills",
        detail: item.text,
        to: item.to,
        tone: "critical",
      });
    } else if (item.kind === "unapproved_expenses") {
      rows.push({
        key: item.kind,
        title: "Expenses awaiting approval",
        detail: item.text,
        to: item.to,
        tone: "warn",
      });
    } else if (item.kind === "cash") {
      rows.push({
        key: item.kind,
        title: "Cash position",
        detail: item.text,
        to: item.to,
        tone: "warn",
      });
    } else {
      rows.push({
        key: item.text,
        title: "Needs review",
        detail: item.text,
        to: item.to,
        tone: "warn",
      });
    }
  }

  if (losses.length === 1) {
    rows.push({
      key: losses[0].text,
      title: "Loss-making camp",
      detail: losses[0].text,
      to: losses[0].to,
      tone: "warn",
    });
  } else if (losses.length > 1) {
    rows.push({
      key: "loss_camps",
      title: "Loss-making camps",
      detail: losses.map((l) => l.text.replace(/ is loss-making/, "")).join(" · "),
      to: "/camps",
      tone: "warn",
    });
  }

  return rows;
}

export function Overview() {
  const nav = useNavigate();
  const { filters } = useFilters();
  const [series, setSeries] = useState<"both" | "revenue" | "expense">("both");
  const { data, isLoading, error } = useQuery({
    queryKey: ["executive", filters],
    queryFn: () => api<Dash>(`/dashboard/executive${toQuery(filters)}`),
  });

  const attentionRows = useMemo(() => buildAttentionRows(data?.attention || []), [data?.attention]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading company finance…</p>;
  if (error || !data) return <p className="text-sm text-negative">Could not load the dashboard. Is the API running?</p>;

  const monthly = data.charts.monthly_revenue.map((r, i) => ({
    month: r.month,
    revenue: r.amount,
    expense: data.charts.monthly_expense[i]?.amount || 0,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle="Revenue, margin, EBITDA and cash from posted ledger activity."
      />

      <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(15,107,76,0.14),_transparent_55%),linear-gradient(135deg,_rgba(232,240,236,0.85),_transparent_52%)]" />
        <div className="relative grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:p-4">
          <div className="lg:pr-5">
            <HeroMetric label="Total revenue" kpi={data.revenue} emphasize onClick={() => nav("/revenue")} />
          </div>
          <div className="lg:border-l lg:border-border/70 lg:px-5">
            <HeroMetric label="Gross profit" kpi={data.gross_profit} onClick={() => nav("/pnl")} />
          </div>
          <div className="lg:border-l lg:border-border/70 lg:px-5">
            <HeroMetric label="Gross margin" kpi={data.gross_margin} format="pct" />
          </div>
          <div className="lg:border-l lg:border-border/70 lg:pl-5">
            <HeroMetric label="EBITDA" kpi={data.ebitda} onClick={() => nav("/pnl")} />
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
        <Panel title="Financial performance" description="Revenue and expenses by month">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(
              [
                ["both", "Both"],
                ["revenue", "Revenue"],
                ["expense", "Expenses"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSeries(id)}
                className={`h-7 rounded-full px-3 text-xs font-semibold transition ${
                  series === id
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground ring-1 ring-border hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <MoneyLine
            data={monthly}
            x="month"
            y={series === "expense" ? "expense" : "revenue"}
            y2={series === "both" ? "expense" : undefined}
            height="sm"
          />
        </Panel>

        <section className="surface-card p-3.5 md:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Financial position</h3>
              <p className="text-xs text-muted-foreground">Cash, working capital and runway</p>
            </div>
            <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => nav("/pnl")}>
              Net {inr(data.net_profit.value)}
              <ArrowRight className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PositionTile label="Cash" value={inr(data.cash_balance.value)} />
            <PositionTile label="Receivables" value={inr(data.receivables.value)} onClick={() => nav("/invoices")} />
            <PositionTile label="Payables" value={inr(data.payables.value)} onClick={() => nav("/expenses")} />
            <PositionTile
              label="Operating expenses"
              value={inr(data.operating_expenses.value)}
              onClick={() => nav("/expenses")}
            />
            <PositionTile
              label="Burn / month"
              value={inr(data.burn_rate.value)}
              title="Average gross monthly cash outflow (credits to cash/bank), not net burn"
            />
            <PositionTile
              label="Runway"
              value={`${Number(data.runway_months ?? 0)} mo`}
              negative={(data.runway_months ?? 99) < 3}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.15fr]">
        <section className="surface-card overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-negative opacity-40" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-negative" />
                </span>
                <h3 className="text-sm font-semibold tracking-tight">Needs attention</h3>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {attentionRows.length ? `${attentionRows.length} items require follow-up` : "Nothing urgent right now"}
              </p>
            </div>
          </div>

          {attentionRows.length ? (
            <ul className="divide-y divide-border">
              {attentionRows.map((row) => (
                <li key={row.key} className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${
                      row.tone === "critical" ? "bg-negative" : "bg-warning"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{row.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => nav(row.to)}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition hover:gap-1.5"
                  >
                    Take action
                    <ArrowRight className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">All clear — no overdue risk items in this view.</p>
          )}
        </section>

        <Panel title="Revenue by city" description="Top cities in the selected period">
          <MoneyBars
            height="sm"
            data={(data.charts.by_city || []).slice(0, 8).map((r) => ({
              label: r.label || r.key,
              amount: r.amount,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
