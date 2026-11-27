import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { inr, pct } from "../lib/format";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/AppShell";
import { KpiCard } from "../components/KpiCard";
import { downloadExport, inputClass, useLookups } from "../components/FormKit";

type CampRow = {
  camp_id: string;
  name: string;
  city: string | null;
  client: string | null;
  date: string;
  revenue: number;
  total_cost: number;
  net_profit: number;
  margin: number;
  roi: number;
  status: string;
  channel: string;
};

export function Camps() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: lu } = useLookups();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [city, setCity] = useState("");
  const [client, setClient] = useState("");
  const [channel, setChannel] = useState("b2b");
  const [statusFilter, setStatusFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api("/camps", {
        method: "POST",
        body: JSON.stringify({ name, camp_date: date, channel, status: "planned", city_id: city || null, client_id: client || null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["camps"] });
      setOpen(false);
      setName("");
    },
  });
  const { data } = useQuery({ queryKey: ["camps"], queryFn: () => api<{ items: CampRow[] }>("/camps") });
  const rows = useMemo(() => {
    let list = data?.items || [];
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    if (cityFilter) list = list.filter((r) => String(r.city || "") === cityFilter || String((r as CampRow & { city_id?: string }).city_id || "") === cityFilter);
    if (clientFilter) list = list.filter((r) => String(r.client || "") === clientFilter || String((r as CampRow & { client_id?: string }).client_id || "") === clientFilter);
    return list;
  }, [data, statusFilter, cityFilter, clientFilter]);

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
    const cost = rows.reduce((s, r) => s + Number(r.total_cost || 0), 0);
    const profit = rows.reduce((s, r) => s + Number(r.net_profit || 0), 0);
    const roiAvg = rows.length ? rows.reduce((s, r) => s + Number(r.roi || 0), 0) / rows.length : 0;
    const profitPct = revenue ? profit / revenue : 0;
    return { camps: rows.length, revenue, cost, profit, roiAvg, profitPct };
  }, [rows]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Camps"
        subtitle="Revenue, cost, profit % and ROI from camp-linked money in and money out."
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => downloadExport("camps")}>Export CSV</button>
            <button className="btn-primary" onClick={() => setOpen(true)}>New camp</button>
          </div>
        }
      />

      {open ? (
        <form
          className="surface-card flex flex-wrap gap-2 p-3.5"
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
        >
          <input className={inputClass + " max-w-xs"} placeholder="Camp name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className={inputClass + " w-auto"} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select className={inputClass + " w-auto"} value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">City</option>
            {lu?.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={inputClass + " w-auto"} value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">Client</option>
            {lu?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={inputClass + " w-auto"} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="b2b">B2B</option>
            <option value="b2c">B2C</option>
          </select>
          <button className="btn-primary">Create</button>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        </form>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="planned">Planned</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className={inputClass} value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
          <option value="">All cities</option>
          {lu?.cities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select className={inputClass} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">All clients</option>
          {lu?.clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Camps" kpi={{ value: totals.camps }} format="number" />
        <KpiCard label="Revenue" kpi={{ value: totals.revenue }} />
        <KpiCard label="Cost" kpi={{ value: totals.cost }} />
        <KpiCard label="Profit" kpi={{ value: totals.profit }} />
        <KpiCard label="Avg ROI" kpi={{ value: totals.roiAvg }} format="pct" />
        <KpiCard label="Profit %" kpi={{ value: totals.profitPct }} format="pct" />
      </div>

      <DataTable
        rows={rows.map((r) => ({ ...r, id: r.camp_id }))}
        onRow={(r) => nav(`/camps/${r.camp_id}`)}
        empty="No camps yet. Add your first camp."
        columns={[
          { key: "name", label: "Camp" },
          { key: "city", label: "City" },
          { key: "client", label: "Client" },
          { key: "date", label: "Date" },
          { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(Number(r.revenue)) },
          { key: "total_cost", label: "Cost", align: "right", render: (r) => inr(Number(r.total_cost)) },
          {
            key: "net_profit",
            label: "Profit",
            align: "right",
            render: (r) => <span className={Number(r.net_profit) >= 0 ? "" : "text-negative"}>{inr(Number(r.net_profit))}</span>,
          },
          { key: "margin", label: "Margin", align: "right", render: (r) => pct(Number(r.margin)) },
            { key: "roi", label: "ROI", align: "right", render: (r) => <span title="Camp profit ÷ investment × 100">{pct(Number(r.roi))}</span> },
            {
              key: "flags",
              label: "Flags",
              render: (r) => {
                const flags = (r as CampRow & { flags?: string[] }).flags || [];
                if (!flags.length) return "—";
                return flags.map((f) => f.replace(/_/g, " ")).join(", ");
              },
            },
            { key: "status", label: "Status" },
          ]}
        />
    </div>
  );
}
