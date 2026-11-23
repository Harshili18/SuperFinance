import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { inr, pct } from "../lib/format";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/AppShell";
import { KpiCard } from "../components/KpiCard";
import { MoneyLine, Panel } from "../components/Charts";
import { Chips } from "../components/FormKit";
import { RevenueForm } from "../components/MoneyForms";

type AppRev = {
  revenue: number;
  transactions: number;
  aov: number;
  cogs: number;
  contribution: number;
  margin: number;
  monthly: { month: string; amount: number }[];
};

type Client = {
  id: string;
  name: string;
  industry?: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  camps: number;
  outstanding: number;
};

type Pkg = {
  package_id: string;
  name: string;
  selling_price: number;
  actual_revenue: number;
  units_sold: number;
  actual_margin: number;
  diagnostic_cost?: number;
  consultation_cost?: number;
  contribution_profit?: number;
};

export function Sales() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [chip, setChip] = useState("overview");
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const { data: app } = useQuery({ queryKey: ["app-rev"], queryFn: () => api<AppRev>("/app-revenue") });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => api<{ items: Client[] }>("/clients") });
  const { data: pkgs } = useQuery({ queryKey: ["packages"], queryFn: () => api<{ items: Pkg[] }>("/packages") });
  const create = useMutation({
    mutationFn: () => api("/clients", { method: "POST", body: JSON.stringify({ name: clientName }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setClientName("");
      setOpen(false);
    },
  });

  return (
    <div>
      <PageHeader
        title="Sales & Clients"
        subtitle="B2B, B2C, app and package sales — contribution, not company P&L again."
        actions={
          <>
            <button className="h-8 rounded-md border border-border px-2.5 text-xs font-semibold" onClick={() => setOpen(true)}>New client</button>
            <button className="h-8 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground" onClick={() => setChip("record")}>Record sale</button>
          </>
        }
      />

      <div className="my-3">
        <Chips
          value={chip}
          onChange={setChip}
          options={[
            { id: "overview", label: "Overview" },
            { id: "clients", label: "Clients" },
            { id: "packages", label: "Packages" },
            { id: "app", label: "App / B2C" },
            { id: "record", label: "Record sale" },
          ]}
        />
      </div>

      {open ? (
        <form
          className="mb-3 flex gap-2 rounded-md border border-border bg-card p-2"
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
        >
          <input className="h-8 flex-1 rounded-md border border-border px-2 text-sm" placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
          <button className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">Create</button>
        </form>
      ) : null}

      {chip === "record" ? <RevenueForm onDone={() => { setChip("overview"); qc.invalidateQueries(); }} /> : null}

      {(chip === "overview" || chip === "app") && app ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <KpiCard label="App revenue" kpi={{ value: app.revenue }} />
            <KpiCard label="Orders" kpi={{ value: app.transactions }} format="number" />
            <KpiCard label="AOV" kpi={{ value: app.aov }} />
            <KpiCard label="Contribution" kpi={{ value: app.contribution }} />
          </div>
          <div className="mt-3">
            <Panel title="Monthly app revenue">
              <MoneyLine data={app.monthly} />
            </Panel>
          </div>
        </>
      ) : null}

      {(chip === "overview" || chip === "clients") ? (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold">Client profitability</h2>
          <DataTable
            rows={clients?.items || []}
            onRow={(r) => nav(`/clients/${r.id}`)}
            empty="No clients yet."
            columns={[
              { key: "name", label: "Client" },
              { key: "camps", label: "Camps", align: "right" },
              { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(Number(r.revenue)) },
              { key: "profit", label: "Profit", align: "right", render: (r) => <span className={Number(r.profit) < 0 ? "text-negative" : ""}>{inr(Number(r.profit))}</span> },
              { key: "margin", label: "Margin", align: "right", render: (r) => pct(Number(r.margin)) },
              { key: "outstanding", label: "Outstanding", align: "right", render: (r) => inr(Number(r.outstanding)) },
            ]}
          />
        </div>
      ) : null}

      {(chip === "overview" || chip === "packages") ? (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold">Package contribution</h2>
          <DataTable
            rows={(pkgs?.items || []).map((p) => ({ ...p, id: p.package_id }))}
            empty="No packages."
            columns={[
              { key: "name", label: "Package" },
              { key: "selling_price", label: "ASP", align: "right", render: (r) => inr(Number(r.selling_price), false) },
              { key: "units_sold", label: "Sold", align: "right" },
              { key: "actual_revenue", label: "Revenue", align: "right", render: (r) => inr(Number(r.actual_revenue)) },
              { key: "actual_margin", label: "Margin", align: "right", render: (r) => pct(Number(r.actual_margin)) },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}
