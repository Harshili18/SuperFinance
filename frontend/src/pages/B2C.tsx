import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { inr, pct } from "../lib/format";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/AppShell";
import { KpiCard } from "../components/KpiCard";
import { MoneyLine, Panel } from "../components/Charts";

type AppRev = {
  revenue: number;
  transactions: number;
  aov: number;
  cogs: number;
  contribution: number;
  margin: number;
  monthly: { month: string; amount: number }[];
};

type Pkg = {
  package_id: string;
  name: string;
  selling_price: number;
  actual_revenue: number;
  units_sold: number;
  actual_margin: number;
};

export function B2C() {
  const { data } = useQuery({ queryKey: ["app-rev"], queryFn: () => api<AppRev>("/app-revenue") });
  const { data: pkgs } = useQuery({ queryKey: ["packages"], queryFn: () => api<{ items: Pkg[] }>("/packages") });
  if (!data) return <p className="text-muted-foreground">Loading B2C…</p>;
  return (
    <div className="space-y-3">
      <PageHeader title="B2C" subtitle="App sales and packages. No clinical data is stored." />
      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid grid-cols-2 gap-2">
          <KpiCard label="App revenue" kpi={{ value: data.revenue }} />
          <KpiCard label="Orders" kpi={{ value: data.transactions }} format="number" />
          <KpiCard label="AOV" kpi={{ value: data.aov }} />
          <KpiCard label="Contribution" kpi={{ value: data.contribution }} />
        </div>
        <Panel title="Monthly app revenue">
          <MoneyLine data={data.monthly} height="sm" />
        </Panel>
      </div>
      <section>
        <h2 className="mb-2 text-sm font-semibold">Packages</h2>
        <DataTable
          rows={(pkgs?.items || []).map((p) => ({ ...p, id: p.package_id }))}
          empty="No packages yet."
          columns={[
            { key: "name", label: "Package" },
            { key: "selling_price", label: "Price", align: "right", render: (r) => inr(Number(r.selling_price), false) },
            { key: "units_sold", label: "Sold", align: "right" },
            { key: "actual_revenue", label: "Revenue", align: "right", render: (r) => inr(Number(r.actual_revenue)) },
            { key: "actual_margin", label: "Margin", align: "right", render: (r) => pct(Number(r.actual_margin)) },
          ]}
        />
      </section>
    </div>
  );
}
