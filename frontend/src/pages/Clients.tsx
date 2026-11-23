import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { inr, pct } from "../lib/format";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/AppShell";
import { KpiCard } from "../components/KpiCard";

type Row = {
  id: string;
  name: string;
  industry: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  camps: number;
  outstanding: number;
};

export function Clients() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api("/clients", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      setName("");
    },
  });
  const { data } = useQuery({ queryKey: ["clients"], queryFn: () => api<{ items: Row[] }>("/clients") });
  return (
    <div>
      <PageHeader
        title="B2B clients"
        subtitle="High revenue is not the same as high profit."
        actions={
          <button className="h-9 rounded-md bg-sf-primary px-3 text-sm text-white" onClick={() => setOpen(true)}>
            New client
          </button>
        }
      />
      {open ? (
        <form
          className="mb-4 flex gap-2 rounded-lg border border-sf-border bg-sf-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <input className="h-9 flex-1 rounded-md border border-sf-border px-2 text-sm" placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="h-9 rounded-md bg-sf-primary px-3 text-sm text-white">Create</button>
        </form>
      ) : null}
      <DataTable
        rows={data?.items || []}
        onRow={(r) => nav(`/clients/${r.id}`)}
        empty="Create a B2B client to start invoicing camps."
        columns={[
          { key: "name", label: "Client" },
          { key: "industry", label: "Industry" },
          { key: "camps", label: "Camps", align: "right" },
          { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(r.revenue) },
          { key: "profit", label: "Profit", align: "right", render: (r) => inr(r.profit) },
          { key: "margin", label: "Margin", align: "right", render: (r) => pct(r.margin) },
          { key: "outstanding", label: "Outstanding", align: "right", render: (r) => inr(r.outstanding) },
        ]}
      />
    </div>
  );
}

export function ClientDetail() {
  const { id } = useParams();
  const { data } = useQuery({
    queryKey: ["client", id],
    queryFn: () =>
      api<{
        name: string;
        gstin: string;
        revenue: number;
        direct_cost: number;
        allocated_cost: number;
        gross_profit: number;
        net_profit: number;
        margin: number;
        outstanding: number;
        camps: { camp_id: string; name: string; revenue: number; net_profit: number; margin: number }[];
      }>(`/clients/${id}`),
  });
  if (!data) return <p className="text-sf-muted">Loading client…</p>;
  return (
    <div>
      <PageHeader title={data.name} subtitle={data.gstin} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Revenue" kpi={{ value: data.revenue }} />
        <KpiCard label="Direct cost" kpi={{ value: data.direct_cost }} />
        <KpiCard label="Net profit" kpi={{ value: data.net_profit }} />
        <KpiCard label="Outstanding" kpi={{ value: data.outstanding }} />
      </div>
      <h2 className="mb-3 mt-8 text-sm font-medium">Camps</h2>
      <DataTable
        rows={(data.camps || []).map((c) => ({ ...c, id: c.camp_id }))}
        columns={[
          { key: "name", label: "Camp" },
          { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(r.revenue) },
          { key: "net_profit", label: "Profit", align: "right", render: (r) => inr(r.net_profit) },
          { key: "margin", label: "Margin", align: "right", render: (r) => pct(r.margin) },
        ]}
      />
    </div>
  );
}
