import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { toQuery, useFilters } from "../lib/filters";
import { inr, pct } from "../lib/format";
import { PageHeader } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { Chips, downloadExport } from "../components/FormKit";
import { Profitability } from "./Profitability";

const TABS = [
  { id: "pnl", label: "P&L" },
  { id: "cashflow", label: "Cash flow" },
  { id: "bs", label: "Balance sheet" },
  { id: "tb", label: "Trial balance" },
  { id: "gl", label: "General ledger" },
  { id: "gst", label: "GST" },
  { id: "ar", label: "Receivables" },
  { id: "ap", label: "Payables" },
  { id: "camps", label: "Camp P&L" },
  { id: "partners", label: "Partners" },
  { id: "mis", label: "MIS" },
];

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between border-b border-border/70 py-1.5 text-sm">
      <dt>{k}</dt>
      <dd className={`num ${v < 0 ? "text-negative" : ""}`}>{inr(v, false)}</dd>
    </div>
  );
}

export function Reports() {
  const { filters } = useFilters();
  const [tab, setTab] = useState("pnl");
  const q = toQuery(filters);

  const { data: pnl } = useQuery({ queryKey: ["pnl", filters], queryFn: () => api<Record<string, unknown>>(`/reports/pnl${q}`), enabled: tab === "pnl" });
  const { data: cf } = useQuery({ queryKey: ["cf", filters], queryFn: () => api<Record<string, number | string>>(`/reports/cashflow${q}`), enabled: tab === "cashflow" });
  const { data: bs } = useQuery({ queryKey: ["bs", filters], queryFn: () => api<Record<string, unknown>>(`/reports/balance-sheet${q}`), enabled: tab === "bs" });
  const { data: tb } = useQuery({ queryKey: ["tb", filters], queryFn: () => api<{ rows: Record<string, unknown>[]; total_debit: number; total_credit: number; balanced: boolean; disclaimer: string }>(`/reports/trial-balance${q}`), enabled: tab === "tb" });
  const { data: gl } = useQuery({ queryKey: ["gl", filters], queryFn: () => api<{ items: Record<string, unknown>[] }>(`/reports/general-ledger${q}`), enabled: tab === "gl" });
  const { data: gst } = useQuery({ queryKey: ["gst", filters], queryFn: () => api<Record<string, number | string>>(`/reports/gst${q}`), enabled: tab === "gst" });
  const { data: ar } = useQuery({ queryKey: ["ar"], queryFn: () => api<{ total: number; buckets: Record<string, number>; invoices: Record<string, unknown>[] }>("/reports/receivables"), enabled: tab === "ar" });
  const { data: ap } = useQuery({ queryKey: ["ap", filters], queryFn: () => api<{ total: number; items: Record<string, unknown>[] }>(`/reports/payables${q}`), enabled: tab === "ap" });
  const { data: camps } = useQuery({ queryKey: ["camp-report"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/reports/camp-profitability"), enabled: tab === "camps" });
  const { data: partners } = useQuery({ queryKey: ["partner-report", filters], queryFn: () => api<{ items: Record<string, unknown>[] }>(`/reports/partners${q}`), enabled: tab === "partners" });

  return (
    <div>
      <PageHeader
        title="Reports & CA"
        subtitle="Working reports from posted journals — validate before statutory filing."
        actions={<button className="h-8 rounded-md border border-border px-2.5 text-xs" onClick={() => downloadExport("pnl")}>Export P&L</button>}
      />
      <div className="my-3">
        <Chips value={tab} onChange={setTab} options={TABS} />
      </div>

      {tab === "pnl" && pnl ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-card p-3">
            <div className="mb-2 text-sm font-semibold">Profit & loss</div>
            <dl>
              <Row k="Total revenue" v={Number(pnl.total_revenue)} />
              <Row k="Direct costs" v={Number(pnl.total_cogs)} />
              <Row k="Gross profit" v={Number(pnl.gross_profit)} />
              <div className="py-1 text-xs text-muted-foreground">Gross margin {pct(Number(pnl.gross_margin))}</div>
              <Row k="Operating expenses" v={Number(pnl.total_opex)} />
              <Row k="EBITDA" v={Number(pnl.ebitda)} />
              <Row k="Depreciation" v={Number(pnl.depreciation)} />
              <Row k="Interest" v={Number(pnl.interest)} />
              <Row k="Tax" v={Number(pnl.taxes)} />
              <Row k="Net profit" v={Number(pnl.net_profit)} />
            </dl>
          </div>
          <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Formulas</p>
            <p className="mt-2">Gross profit = net revenue − direct costs (COGS + direct camp spend).</p>
            <p className="mt-1">EBITDA = gross profit − indirect operating expenses.</p>
            <p className="mt-1">Camp allocated salary is excluded from company OpEx to avoid double-counting.</p>
          </div>
        </div>
      ) : null}

      {tab === "cashflow" && cf ? (
        <div className="max-w-md rounded-md border border-border bg-card p-3">
          <dl>
            <Row k="Opening cash" v={Number(cf.opening_cash)} />
            <Row k="Cash inflows" v={Number(cf.cash_inflows)} />
            <Row k="Cash outflows" v={Number(cf.cash_outflows)} />
            <Row k="Operating CF" v={Number(cf.operating_cash_flow)} />
            <Row k="Closing cash" v={Number(cf.closing_cash)} />
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{String(cf.basis || "")}</p>
        </div>
      ) : null}

      {tab === "bs" && bs ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {(
            [
              { title: "Assets", rows: (bs.assets as Record<string, unknown>[]) || [], total: Number(bs.total_assets) },
              { title: "Liabilities", rows: (bs.liabilities as Record<string, unknown>[]) || [], total: Number(bs.total_liabilities) },
              { title: "Equity", rows: (bs.equity as Record<string, unknown>[]) || [], total: Number(bs.total_equity) },
            ] as { title: string; rows: Record<string, unknown>[]; total: number }[]
          ).map((block) => (
            <div key={block.title} className="rounded-md border border-border bg-card p-3">
              <div className="mb-2 text-sm font-semibold">{block.title}</div>
              <DataTable
                rows={block.rows.map((r, i) => ({ ...r, id: String(r.code || i) })) as Record<string, unknown>[]}
                empty="—"
                columns={[
                  { key: "name", label: "Account" },
                  { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
                ]}
              />
              <p className="mt-2 text-right text-sm font-semibold num">{inr(block.total, false)}</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground lg:col-span-3">{String(bs.disclaimer || "")}</p>
        </div>
      ) : null}

      {tab === "tb" && tb ? (
        <>
          <DataTable
            rows={tb.rows.map((r) => ({ ...r, id: String(r.code) })) as Record<string, unknown>[]}
            empty="No journal activity."
            columns={[
              { key: "code", label: "Code" },
              { key: "name", label: "Account" },
              { key: "debit", label: "Debit", align: "right", render: (r) => inr(Number(r.debit), false) },
              { key: "credit", label: "Credit", align: "right", render: (r) => inr(Number(r.credit), false) },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Debits {inr(tb.total_debit, false)} · Credits {inr(tb.total_credit, false)} · {tb.balanced ? "Balanced" : "Out of balance"} — {tb.disclaimer}
          </p>
        </>
      ) : null}

      {tab === "gl" && gl ? (
        <DataTable
          rows={gl.items}
          empty="No journal lines."
          columns={[
            { key: "date", label: "Date" },
            { key: "account_code", label: "Code" },
            { key: "account_name", label: "Account" },
            { key: "memo", label: "Memo" },
            { key: "debit", label: "Debit", align: "right", render: (r) => inr(Number(r.debit), false) },
            { key: "credit", label: "Credit", align: "right", render: (r) => inr(Number(r.credit), false) },
          ]}
        />
      ) : null}

      {tab === "gst" && gst ? (
        <div className="max-w-md rounded-md border border-border bg-card p-3">
          <dl>
            <Row k="Taxable sales" v={Number(gst.taxable_sales)} />
            <Row k="Output GST" v={Number(gst.output_gst)} />
            <Row k="Input GST" v={Number(gst.input_gst)} />
            <Row k="Net GST payable" v={Number(gst.net_gst_payable)} />
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{String(gst.disclaimer || "")}</p>
        </div>
      ) : null}

      {tab === "ar" && ar ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-md border border-border bg-card p-2 text-xs">Total <div className="num text-base font-bold">{inr(ar.total)}</div></div>
            {Object.entries(ar.buckets).map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-card p-2 text-xs">{k.replace("_", "–")} <div className="num text-base font-bold">{inr(v)}</div></div>
            ))}
          </div>
          <DataTable
            rows={ar.invoices.map((r) => ({ ...r, id: String(r.invoice_id || r.number) })) as Record<string, unknown>[]}
            empty="No receivables."
            columns={[
              { key: "number", label: "Invoice" },
              { key: "due_date", label: "Due" },
              { key: "days_overdue", label: "Days", align: "right" },
              { key: "outstanding", label: "Outstanding", align: "right", render: (r) => inr(Number(r.outstanding), false) },
            ]}
          />
        </>
      ) : null}

      {tab === "ap" && ap ? (
        <>
          <p className="mb-2 text-sm">Total payables <span className="num font-semibold">{inr(ap.total, false)}</span></p>
          <DataTable
            rows={ap.items}
            empty="No unpaid bills."
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

      {tab === "camps" && camps ? (
        <DataTable
          rows={(camps.items || []).map((r) => ({ ...r, id: String(r.camp_id) })) as Record<string, unknown>[]}
          empty="No camps."
          columns={[
            { key: "name", label: "Camp" },
            { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(Number(r.revenue)) },
            { key: "total_cost", label: "Cost", align: "right", render: (r) => inr(Number(r.total_cost)) },
            { key: "net_profit", label: "Profit", align: "right", render: (r) => <span className={Number(r.net_profit) < 0 ? "text-negative" : ""}>{inr(Number(r.net_profit))}</span> },
            { key: "margin", label: "Margin", align: "right", render: (r) => pct(Number(r.margin)) },
            { key: "roi", label: "ROI", align: "right", render: (r) => pct(Number(r.roi)) },
          ]}
        />
      ) : null}

      {tab === "partners" && partners ? (
        <DataTable
          rows={partners.items}
          empty="No partners."
          columns={[
            { key: "name", label: "Partner" },
            { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(Number(r.revenue)) },
            { key: "cost", label: "Cost", align: "right", render: (r) => inr(Number(r.cost)) },
            { key: "contribution", label: "Contribution", align: "right", render: (r) => inr(Number(r.contribution)) },
          ]}
        />
      ) : null}

      {tab === "mis" ? <Profitability embedded /> : null}
    </div>
  );
}
