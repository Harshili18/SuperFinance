import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, type Kpi } from "../lib/api";
import { toQuery, useFilters } from "../lib/filters";
import { KpiCard } from "../components/KpiCard";
import { MoneyBars, MoneyLine, Panel } from "../components/Charts";
import { PageHeader } from "../components/AppShell";

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
  attention: { text: string; to: string; kind?: string }[];
};

export function Overview() {
  const nav = useNavigate();
  const { filters } = useFilters();
  const { data, isLoading, error } = useQuery({
    queryKey: ["executive", filters],
    queryFn: () => api<Dash>(`/dashboard/executive${toQuery(filters)}`),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading company finance…</p>;
  if (error || !data) return <p className="text-sm text-negative">Could not load the dashboard. Is the API running?</p>;

  const monthly = data.charts.monthly_revenue.map((r, i) => ({
    month: r.month,
    revenue: r.amount,
    expense: data.charts.monthly_expense[i]?.amount || 0,
  }));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Revenue, margin, EBITDA and cash from posted ledger activity."
      />

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <button type="button" className="text-left" onClick={() => nav("/revenue")}>
          <KpiCard label="Total revenue" kpi={data.revenue} />
        </button>
        <button type="button" className="text-left" onClick={() => nav("/pnl")}>
          <KpiCard label="Gross profit" kpi={data.gross_profit} />
        </button>
        <KpiCard label="Gross margin" kpi={data.gross_margin} format="pct" />
        <button type="button" className="text-left" onClick={() => nav("/expenses")}>
          <KpiCard label="Operating expenses" kpi={data.operating_expenses} />
        </button>
        <button type="button" className="text-left" onClick={() => nav("/pnl")}>
          <KpiCard label="EBITDA" kpi={data.ebitda} />
        </button>
        <button type="button" className="text-left" onClick={() => nav("/pnl")}>
          <KpiCard label="Net profit" kpi={data.net_profit} />
        </button>
        <KpiCard label="Cash" kpi={data.cash_balance} />
        <button type="button" className="text-left" onClick={() => nav("/invoices")}>
          <KpiCard label="Receivables" kpi={data.receivables} />
        </button>
        <button type="button" className="text-left" onClick={() => nav("/expenses")}>
          <KpiCard label="Payables" kpi={data.payables} />
        </button>
        <KpiCard label="Burn / month" kpi={data.burn_rate} />
        <KpiCard
          label="Runway"
          kpi={{ value: Number(data.runway_months ?? 0) }}
          format="number"
          suffix=" mo"
        />
      </div>

      {data.attention?.length ? (
        <div className="mt-4 rounded-md border border-[#cc203b]/30 bg-[#cc203b]/5 px-3 py-2 text-xs text-negative">
          <p className="font-semibold">Alerts</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {data.attention.map((a) => (
              <li key={a.text}>
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => nav(a.to)}>
                  {a.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel title="Monthly P&L trend" description="Revenue and expenses by month">
          <MoneyLine data={monthly} x="month" y="revenue" y2="expense" />
        </Panel>
        <Panel title="Revenue by city">
          <MoneyBars
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
