import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { toQuery, useFilters } from "../lib/filters";
import { inr } from "../lib/format";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/AppShell";
import { Chips, Pill } from "../components/FormKit";
import { ExpenseForm, MonthlyClaimForm, PaymentForm, RevenueForm } from "../components/MoneyForms";

type Row = {
  id: string;
  date: string;
  type: string;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  amount: number;
  payment_status?: string;
  channel?: string | null;
  direction?: string;
};

const TABS = [
  { id: "all", label: "All" },
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
  { id: "payments", label: "Payments" },
  { id: "adjustments", label: "Adjustments" },
];

export function Transactions() {
  const qc = useQueryClient();
  const { filters } = useFilters();
  const [params] = useSearchParams();
  const metric = params.get("metric") || "";
  const [tab, setTab] = useState(metric === "revenue" ? "income" : metric && metric !== "all" ? "expenses" : "all");
  const [drawer, setDrawer] = useState<"none" | "expense" | "revenue" | "payment" | "reimb">("none");

  const q = metric
    ? `/reports/transactions${toQuery({ ...filters })}&metric=${encodeURIComponent(metric)}`
    : `/transactions${toQuery(filters)}${toQuery(filters) ? "&" : "?"}tab=${tab}`;

  const { data, isLoading } = useQuery({
    queryKey: ["txns", filters, tab, metric],
    queryFn: () => api<{ items: Row[] }>(q.includes("?") ? q : `${q}?tab=${tab}`),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const rows = useMemo(() => data?.items || [], [data]);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Transactions"
        subtitle="One ledger for income, expenses, payments and adjustments."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <button className="h-8 rounded-md border border-border px-2.5 text-xs font-semibold" onClick={() => setDrawer("revenue")}>Income</button>
            <button className="h-8 rounded-md border border-border px-2.5 text-xs font-semibold" onClick={() => setDrawer("expense")}>Expense</button>
            <button className="h-8 rounded-md border border-border px-2.5 text-xs font-semibold" onClick={() => setDrawer("payment")}>Payment</button>
            <button className="h-8 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground" onClick={() => setDrawer("expense")}>+ Add Transaction</button>
          </div>
        }
      />

      {drawer !== "none" ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div className="h-full w-full max-w-lg overflow-y-auto bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Add {drawer}</h2>
              <button className="text-xs text-muted-foreground" onClick={() => setDrawer("none")}>Close</button>
            </div>
            <div className="mb-3 flex flex-wrap gap-1">
              {(["expense", "revenue", "payment", "reimb"] as const).map((t) => (
                <button key={t} className={`h-7 rounded-full px-2.5 text-[11px] font-semibold ${drawer === t ? "bg-primary text-primary-foreground" : "border border-border"}`} onClick={() => setDrawer(t)}>
                  {t === "reimb" ? "Reimbursement" : t}
                </button>
              ))}
            </div>
            {drawer === "expense" ? <ExpenseForm onDone={() => { setDrawer("none"); qc.invalidateQueries(); }} /> : null}
            {drawer === "revenue" ? <RevenueForm onDone={() => { setDrawer("none"); qc.invalidateQueries(); }} /> : null}
            {drawer === "payment" ? <PaymentForm onDone={() => { setDrawer("none"); qc.invalidateQueries(); }} /> : null}
            {drawer === "reimb" ? <MonthlyClaimForm onDone={() => { setDrawer("none"); qc.invalidateQueries(); }} /> : null}
          </div>
        </div>
      ) : null}

      {!metric ? (
        <div className="my-3">
          <Chips value={tab} onChange={setTab} options={TABS} />
        </div>
      ) : (
        <p className="my-2 text-xs text-muted-foreground">Filtered by KPI: <span className="font-semibold text-foreground">{metric}</span></p>
      )}

      {isLoading ? <p className="text-sm text-muted-foreground">Loading ledger…</p> : (
        <DataTable
          rows={rows as unknown as Record<string, unknown>[]}
          empty="No posted transactions in this view."
          columns={[
            { key: "date", label: "Date" },
            {
              key: "type",
              label: "Type",
              render: (r) => <Pill tone={String(r.direction) === "in" || String(r.type) === "revenue" ? "ok" : "muted"}>{String(r.type)}</Pill>,
            },
            { key: "category", label: "Category", render: (r) => String(r.subcategory || r.category || "—") },
            { key: "description", label: "Description" },
            {
              key: "amount",
              label: "Amount",
              align: "right",
              render: (r) => (
                <span className={String(r.direction) === "out" || ["expense", "cogs", "payroll", "reimbursement", "payment_out"].includes(String(r.type)) ? "text-negative" : ""}>
                  {inr(Number(r.amount), false)}
                </span>
              ),
            },
            { key: "payment_status", label: "Status", render: (r) => String(r.payment_status || r.status || "—") },
            {
              key: "id",
              label: "",
              align: "right",
              render: (r) =>
                r.status === "submitted" ? (
                  <button className="text-xs font-semibold text-primary" onClick={() => approve.mutate(String(r.id))}>Approve</button>
                ) : null,
            },
          ]}
        />
      )}
    </div>
  );
}
