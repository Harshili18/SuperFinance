import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toQuery, useFilters } from "../lib/filters";
import { inr, pct } from "../lib/format";
import { PageHeader } from "../components/AppShell";
import { KpiCard } from "../components/KpiCard";
import { DataTable } from "../components/DataTable";

type Expl = {
  revenue: number;
  direct_costs: number;
  contribution: number;
  contribution_margin: number;
  allocated_operating_costs: number;
  net_profit: number;
  net_margin: number;
  rows: { key: string; label?: string; revenue: number; cost: number; profit: number; margin: number }[];
};

const GROUPS = ["city", "client", "camp", "package", "channel", "partner", "business_model"];

export function Profitability({ embedded = false }: { embedded?: boolean }) {
  const nav = useNavigate();
  const { filters, setFilters } = useFilters();
  const [group, setGroup] = useState("city");
  const { data } = useQuery({
    queryKey: ["explore", filters, group],
    queryFn: () => api<Expl>(`/profitability${toQuery({ ...filters, group_by: group } as never)}&group_by=${group}`),
  });
  if (!data) return <p className="text-sf-muted">Slicing the ledger…</p>;
  return (
    <div>
      {embedded ? <h2 className="mb-3 text-sm font-semibold">Profitability</h2> : <PageHeader title="Profitability explorer" subtitle="Filter any dimension, then drill the breakdown." />}
      <div className="mb-4 flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={`h-8 rounded-md border px-3 text-sm ${group === g ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
          >
            {g.replace("_", " ")}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Revenue" kpi={{ value: data.revenue }} />
        <KpiCard label="Direct costs" kpi={{ value: data.direct_costs }} />
        <KpiCard label="Contribution" kpi={{ value: data.contribution }} />
        <KpiCard label="Contrib. margin" kpi={{ value: data.contribution_margin }} format="pct" />
        <KpiCard label="Allocated opex" kpi={{ value: data.allocated_operating_costs }} />
        <KpiCard label="Net profit" kpi={{ value: data.net_profit }} />
      </div>
      <div className="mt-6">
        <DataTable
          rows={data.rows.map((r) => ({ ...r, id: r.key, name: r.label || r.key }))}
          onRow={(r) => {
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
            { key: "name", label: group },
            { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(r.revenue) },
            { key: "cost", label: "Cost", align: "right", render: (r) => inr(r.cost) },
            { key: "profit", label: "Profit", align: "right", render: (r) => inr(r.profit) },
            { key: "margin", label: "Margin", align: "right", render: (r) => pct(r.margin) },
          ]}
        />
      </div>
    </div>
  );
}
