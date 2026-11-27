import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, type Kpi } from "../lib/api";
import { toQuery, useFilters } from "../lib/filters";
import { delta, inr, pct } from "../lib/format";
import { MoneyPie, COLORS } from "../components/Charts";
import { PageHeader } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { downloadExport } from "../components/FormKit";

type Dash = {
  revenue: Kpi;
  gross_profit: Kpi;
  gross_margin: Kpi;
  ebitda: Kpi;
  charts: {
    by_city: { label?: string; key: string; amount: number }[];
  };
};

type Expl = {
  revenue: number;
  direct_costs: number;
  contribution: number;
  contribution_margin: number;
  net_profit: number;
  cost_note?: string;
  rows: { key: string; label?: string; name?: string; revenue: number; cost: number; profit: number; margin: number; txn_count?: number }[];
};

const GROUPS = [
  { id: "city", label: "City" },
  { id: "client", label: "Client" },
  { id: "camp", label: "Camp" },
  { id: "package", label: "Package" },
  { id: "channel", label: "Channel" },
  { id: "partner", label: "Partner" },
  { id: "business_model", label: "Business model" },
];

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
  onClick,
}: {
  label: string;
  kpi: Kpi;
  format?: "money" | "pct";
  onClick?: () => void;
}) {
  const negative = kpi.value < 0;
  const value = format === "pct" ? pct(kpi.value) : inr(kpi.value);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`min-w-0 text-left ${onClick ? "rounded-xl transition hover:bg-white/45" : ""}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={`num mt-1.5 truncate text-xl font-bold tracking-tight md:text-2xl ${negative ? "text-negative" : "text-foreground"}`}>
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <TrendBadge kpi={kpi} />
        <span className="text-[11px] text-muted-foreground">
          {kpi.change_pct == null ? "Current period" : "vs prior"}
        </span>
      </div>
    </Tag>
  );
}

export function MIS() {
  const nav = useNavigate();
  const { filters, setFilters } = useFilters();
  const [group, setGroup] = useState("city");
  const [sort, setSort] = useState("profit_desc");

  const { data, isLoading, error } = useQuery({
    queryKey: ["executive", filters],
    queryFn: () => api<Dash>(`/dashboard/executive${toQuery(filters)}`),
  });

  const { data: expl } = useQuery({
    queryKey: ["explore", filters, group, sort],
    queryFn: () => api<Expl>(`/profitability${toQuery(filters)}&group_by=${group}&sort=${sort}`),
  });

  const cityData = useMemo(
    () => (data?.charts.by_city || []).map((c) => ({ name: c.label || c.key, value: c.amount })),
    [data],
  );
  const cityTotal = cityData.reduce((s, c) => s + c.value, 0);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading MIS…</p>;
  if (error || !data) return <p className="text-sm text-negative">Could not load analytics. Is the API running?</p>;

  return (
    <div className="space-y-3">
      <PageHeader
        title="MIS & Analytics"
        subtitle="Same ledger, sliced for management."
        actions={
          <button type="button" className="btn-secondary" onClick={() => downloadExport("pnl", "csv", toQuery(filters))}>
            <Download className="size-3.5" />
            Export
          </button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1.05fr_1fr]">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(15,107,76,0.12),_transparent_55%),linear-gradient(160deg,_rgba(232,240,236,0.9),_transparent_55%)]" />
          <div className="relative grid grid-cols-2 gap-x-4 gap-y-4 p-4 md:p-5">
            <HeroMetric label="Total revenue" kpi={data.revenue} onClick={() => nav("/revenue")} />
            <HeroMetric label="Gross profit" kpi={data.gross_profit} onClick={() => nav("/pnl")} />
            <HeroMetric label="Gross margin" kpi={data.gross_margin} format="pct" />
            <HeroMetric label="EBITDA" kpi={data.ebitda} onClick={() => nav("/pnl")} />
          </div>
        </section>

        <section className="surface-card p-3.5 md:p-4">
          <div className="mb-2.5">
            <h3 className="text-sm font-semibold tracking-tight">City-wise revenue</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Distribution across operating cities</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_0.95fr] sm:items-center">
            <div className="relative">
              <MoneyPie data={cityData} showLegend={false} />
              {cityTotal > 0 ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="num text-sm font-bold tracking-tight">{inr(cityTotal)}</p>
                    <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Total</p>
                  </div>
                </div>
              ) : null}
            </div>
            <ul className="space-y-1.5">
              {cityData.slice(0, 6).map((c, i) => {
                const share = cityTotal ? (c.value / cityTotal) * 100 : 0;
                return (
                  <li key={c.name} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    <span className="num shrink-0 text-xs font-semibold">{inr(c.value)}</span>
                    <span className="w-9 shrink-0 text-right text-[11px] text-muted-foreground">{share.toFixed(0)}%</span>
                  </li>
                );
              })}
              {!cityData.length ? <li className="text-sm text-muted-foreground">No city revenue in this period.</li> : null}
            </ul>
          </div>
        </section>
      </div>

      <section className="surface-card min-w-0 p-3.5 md:p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold tracking-tight">Profitability by dimension</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Slice the ledger, then drill into a row</p>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              className={`h-7 rounded-full px-3 text-xs font-semibold transition ${
                group === g.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-card text-muted-foreground ring-1 ring-border hover:bg-muted"
              }`}
            >
              {g.label}
            </button>
          ))}
          <select
            className="ml-auto h-7 rounded-full border border-border bg-card px-2 text-xs"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            title="Sort segments"
          >
            <option value="profit_desc">Highest profit</option>
            <option value="revenue_desc">Highest revenue</option>
            <option value="margin_asc">Lowest margin</option>
            <option value="loss_making">Loss-making only</option>
          </select>
        </div>

        {expl ? (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ["Revenue", inr(expl.revenue)],
                ["Direct costs", inr(expl.direct_costs)],
                ["Contribution", inr(expl.contribution)],
                ["Contrib. margin", pct(expl.contribution_margin)],
                ["Net profit", inr(expl.net_profit)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-surface-soft px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="num mt-0.5 text-sm font-semibold tracking-tight">{value}</p>
                </div>
              ))}
            </div>
            {expl.cost_note ? <p className="mb-3 text-[11px] text-muted-foreground">{expl.cost_note}</p> : null}
            <DataTable
              rows={expl.rows.map((r) => ({
                ...r,
                id: r.key,
                name: (r as { name?: string }).name || r.label || (r.key === "unassigned" ? "Not assigned" : r.key),
              }))}
              onRow={(r) => {
                if (String(r.key) === "unassigned") return;
                const map: Record<string, keyof typeof filters> = {
                  city: "city_id",
                  client: "client_id",
                  camp: "camp_id",
                  package: "package_id",
                  channel: "channel",
                  partner: "diagnostic_partner_id",
                  business_model: "business_model",
                };
                const field = map[group];
                if (!field) return;
                setFilters({ ...filters, [field]: String(r.key) });
                if (group === "camp") nav(`/camps/${r.key}`);
                if (group === "client") nav(`/clients/${r.key}`);
              }}
              empty="No transactions match these filters."
              columns={[
                { key: "name", label: GROUPS.find((g) => g.id === group)?.label || group },
                { key: "txn_count", label: "Txns", align: "right", render: (r) => String(r.txn_count ?? "—") },
                { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(Number(r.revenue)) },
                { key: "cost", label: "Direct costs", align: "right", render: (r) => inr(Number(r.cost)) },
                {
                  key: "profit",
                  label: "Contribution",
                  align: "right",
                  render: (r) => (
                    <span className={Number(r.profit) < 0 ? "text-negative" : ""}>{inr(Number(r.profit))}</span>
                  ),
                },
                {
                  key: "margin",
                  label: "Margin",
                  align: "right",
                  render: (r) => (
                    <span className={Number(r.margin) < 0 ? "text-negative" : ""}>{pct(Number(r.margin))}</span>
                  ),
                },
              ]}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Slicing the ledger…</p>
        )}
      </section>
    </div>
  );
}
