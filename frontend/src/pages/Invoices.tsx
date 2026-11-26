import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, apiUrl } from "../lib/api";
import { toQuery, useFilters } from "../lib/filters";
import { inr } from "../lib/format";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/AppShell";
import { KpiCard } from "../components/KpiCard";
import { Chips, downloadExport } from "../components/FormKit";
import { InvoiceForm, PaymentForm } from "../components/MoneyForms";

export function Invoices() {
  const qc = useQueryClient();
  const { filters } = useFilters();
  const [tab, setTab] = useState("invoices");
  const [open, setOpen] = useState<"none" | "invoice" | "payment">("none");
  const { data } = useQuery({ queryKey: ["invoices"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/invoices") });
  const { data: payments } = useQuery({ queryKey: ["payments"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/payments"), enabled: tab === "payments" });
  const { data: ar } = useQuery({ queryKey: ["ar"], queryFn: () => api<{ total: number; buckets: Record<string, number> }>("/reports/receivables") });
  const { data: ap } = useQuery({ queryKey: ["ap", filters], queryFn: () => api<{ total: number; items: Record<string, unknown>[] }>(`/reports/payables${toQuery(filters)}`), enabled: tab === "payables" || tab === "bills" });
  const send = useMutation({
    mutationFn: (id: string) => api(`/invoices/${id}/send`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  return (
    <div>
      <PageHeader
        title="Invoices & Bills"
        subtitle="Sales invoices, collections, receivables and vendor payables — linked to the ledger."
        actions={
          <>
            <button className="h-8 rounded-md border border-border px-2.5 text-xs" onClick={() => downloadExport("invoices")}>Export</button>
            <button className="h-8 rounded-md border border-border px-2.5 text-xs font-semibold" onClick={() => setOpen("payment")}>Record payment</button>
            <button className="h-8 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground" onClick={() => setOpen("invoice")}>Create invoice</button>
          </>
        }
      />

      {open === "invoice" ? (
        <div className="mt-3"><InvoiceForm onDone={() => setOpen("none")} /></div>
      ) : null}
      {open === "payment" ? (
        <div className="mt-3"><PaymentForm onDone={() => setOpen("none")} /></div>
      ) : null}

      <div className="my-3">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { id: "invoices", label: "Sales invoices" },
            { id: "payments", label: "Payments" },
            { id: "receivables", label: "Receivables" },
            { id: "payables", label: "Payables" },
            { id: "bills", label: "Vendor bills" },
          ]}
        />
      </div>

      {ar && (tab === "invoices" || tab === "receivables") ? (
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          <KpiCard label="Total AR" kpi={{ value: ar.total }} />
          <KpiCard label="Current" kpi={{ value: ar.buckets.current }} />
          <KpiCard label="1–30" kpi={{ value: ar.buckets["1_30"] }} />
          <KpiCard label="31–60" kpi={{ value: ar.buckets["31_60"] }} />
          <KpiCard label="90+" kpi={{ value: ar.buckets["90_plus"] }} />
        </div>
      ) : null}

      {tab === "invoices" || tab === "receivables" ? (
        <DataTable
          rows={data?.items || []}
          empty="No invoices yet."
          columns={[
            { key: "number", label: "Number" },
            { key: "client", label: "Client" },
            { key: "date", label: "Date" },
            { key: "due_date", label: "Due" },
            { key: "total", label: "Total", align: "right", render: (r) => inr(Number(r.total), false) },
            { key: "outstanding", label: "Outstanding", align: "right", render: (r) => inr(Number(r.outstanding), false) },
            { key: "status", label: "Status" },
            {
              key: "id",
              label: "",
              render: (r) => (
                <span className="flex gap-2">
                  {r.status === "draft" ? <button className="text-xs font-semibold text-primary" onClick={() => send.mutate(String(r.id))}>Send</button> : null}
                  <a className="text-xs font-semibold text-primary" href={apiUrl(`/invoices/${r.id}/pdf`)} target="_blank" rel="noreferrer">PDF</a>
                </span>
              ),
            },
          ]}
        />
      ) : null}

      {tab === "payments" ? (
        <DataTable
          rows={payments?.items || []}
          empty="No payments recorded."
          columns={[
            { key: "date", label: "Date" },
            { key: "direction", label: "In/Out" },
            { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
            { key: "method", label: "Method" },
            { key: "reference", label: "Reference" },
          ]}
        />
      ) : null}

      {(tab === "payables" || tab === "bills") && ap ? (
        <>
          <p className="mb-2 text-sm">Unpaid approved bills <span className="num font-semibold">{inr(ap.total, false)}</span></p>
          <DataTable
            rows={ap.items}
            empty="No vendor bills outstanding."
            columns={[
              { key: "date", label: "Date" },
              { key: "category", label: "Category" },
              { key: "description", label: "Description" },
              { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
              { key: "status", label: "Status" },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}
