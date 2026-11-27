import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { toQuery, useFilters } from "../lib/filters";
import { inr } from "../lib/format";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/AppShell";
import { KpiCard } from "../components/KpiCard";
import { MoneyBars, Panel } from "../components/Charts";
import { Chips, Pill } from "../components/FormKit";
import { ExpenseForm, MonthlyClaimForm } from "../components/MoneyForms";

type Exp = {
  id: string;
  date: string;
  amount: number;
  category: string;
  subcategory?: string | null;
  camp?: string | null;
  employee?: string | null;
  clinician?: string | null;
  description?: string | null;
  status: string;
};

type Reimb = {
  id: string;
  date: string;
  employee: string;
  kind: string;
  category: string;
  amount: number;
  status: string;
  camp?: string | null;
};

type Breakdown = {
  total: number;
  buckets: Record<string, number>;
  by_month: { key: string; amount: number }[];
  by_quarter: { key: string; amount: number }[];
  by_year: { key: string; amount: number }[];
  by_camp: { key: string; label: string; amount: number }[];
  by_category: { key: string; amount: number }[];
  salary_by_employee: { employee_id: string; employee: string; amount: number }[];
  reimbursements_by_employee: { employee: string; monthly: number; camp: number; total: number }[];
  subscriptions: { id: string; date: string; tool: string; description: string; amount: number; status: string }[];
};

type Emp = { id: string; name: string; monthly_salary: number; department?: string; designation?: string };

const BUCKETS = [
  { id: "all", label: "All" },
  { id: "fixed", label: "Fixed" },
  { id: "salary", label: "Salary" },
  { id: "reimbursement", label: "Reimbursements" },
  { id: "subscription", label: "AI / software" },
  { id: "camp", label: "Camp" },
];

const PERIODS = [
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
  { id: "camp", label: "Camp" },
];

function bucketOf(e: Exp): string {
  const cat = (e.subcategory || e.category || "").toLowerCase();
  if (cat === "salaries") return "salary";
  if (["cursor", "claude", "figma", "software", "technology"].includes(cat)) return "subscription";
  if (e.camp) return "camp";
  if (["rent", "insurance", "office", "communication", "accounting", "legal"].includes(cat)) return "fixed";
  return "other";
}

export function Expenses() {
  const qc = useQueryClient();
  const { filters } = useFilters();
  const [open, setOpen] = useState<"none" | "bill" | "monthly">("none");
  const [bucket, setBucket] = useState("all");
  const [grain, setGrain] = useState("month");
  const [statusChip, setStatusChip] = useState("all");
  const { data: exp } = useQuery({ queryKey: ["expenses"], queryFn: () => api<{ items: Exp[] }>("/expenses") });
  const { data: reimb } = useQuery({ queryKey: ["reimb"], queryFn: () => api<{ items: Reimb[] }>("/reimbursements") });
  const { data: emps } = useQuery({ queryKey: ["employees"], queryFn: () => api<{ items: Emp[] }>("/employees") });
  const { data: br } = useQuery({
    queryKey: ["expense-report", filters],
    queryFn: () => api<Breakdown>(`/reports/expenses${toQuery(filters)}`),
  });
  const approveExp = useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const approveRe = useMutation({
    mutationFn: (id: string) => api(`/reimbursements/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const payRe = useMutation({
    mutationFn: (id: string) => api(`/reimbursements/${id}/pay`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const postPayroll = useMutation({
    mutationFn: () => {
      const now = new Date();
      return api(`/payroll?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  const bills = exp?.items || [];
  const claims = reimb?.items || [];
  const shownBills = bucket === "all" ? bills : bills.filter((e) => bucketOf(e) === bucket);
  const shownClaims = bucket === "reimbursement" || bucket === "all" ? claims : [];
  const series =
    grain === "quarter" ? br?.by_quarter : grain === "year" ? br?.by_year : grain === "camp" ? br?.by_camp : br?.by_month;
  const chart = (series || []).map((r) => ({ label: "label" in r ? r.label || r.key : r.key, amount: r.amount }));

  const rows = useMemo(() => {
    const a = shownBills.map((e) => ({
      id: e.id,
      date: e.date,
      type: e.clinician ? "Clinician" : e.camp ? "Camp" : bucketOf(e),
      who: e.employee || e.clinician || e.camp || "—",
      category: e.subcategory || e.category,
      amount: e.amount,
      status: e.status,
      source: "expense" as const,
    }));
    const b = shownClaims.map((r) => ({
      id: r.id,
      date: r.date,
      type: r.kind === "camp" ? "Camp claim" : "Monthly claim",
      who: r.employee,
      category: r.category,
      amount: r.amount,
      status: r.status,
      source: "reimbursement" as const,
    }));
    const all = [...a, ...b].sort((x, y) => (x.date < y.date ? 1 : -1));
    if (statusChip === "all") return all;
    if (statusChip === "pending") return all.filter((r) => r.status === "submitted");
    if (statusChip === "approved_unpaid") return all.filter((r) => r.status === "approved");
    if (statusChip === "paid") return all.filter((r) => r.status === "paid");
    if (statusChip === "rejected") return all.filter((r) => r.status === "rejected");
    return all;
  }, [shownBills, shownClaims, statusChip]);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Expenses"
        subtitle="Fixed costs, salary, reimbursements and AI subscriptions — add anything else by hand."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setOpen("monthly")}>Reimbursement</button>
            <button className="btn-primary" onClick={() => setOpen("bill")}>Add expense</button>
          </>
        }
      />
      {open === "bill" ? <div className="mt-3"><ExpenseForm onDone={() => setOpen("none")} /></div> : null}
      {open === "monthly" ? <div className="mt-3"><MonthlyClaimForm onDone={() => setOpen("none")} /></div> : null}
      <div className="mt-3">
        <Chips
          value={statusChip}
          onChange={setStatusChip}
          options={[
            { id: "all", label: "All statuses" },
            { id: "pending", label: "Pending" },
            { id: "approved_unpaid", label: "Approved unpaid" },
            { id: "paid", label: "Paid" },
            { id: "rejected", label: "Rejected" },
          ]}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KpiCard label="Total" kpi={{ value: br?.total || 0 }} />
          <KpiCard label="Fixed" kpi={{ value: br?.buckets.fixed || 0 }} sub="Rent, office, insurance" />
          <KpiCard label="Salary" kpi={{ value: br?.buckets.salary || 0 }} />
          <KpiCard label="Reimbursements" kpi={{ value: br?.buckets.reimbursement || 0 }} />
          <KpiCard label="AI / software" kpi={{ value: br?.buckets.subscription || 0 }} sub="Cursor, Claude, Figma" />
          <KpiCard label="Camp costs" kpi={{ value: br?.buckets.camp || 0 }} />
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Chips value={bucket} onChange={setBucket} options={BUCKETS} />
            <Chips value={grain} onChange={setGrain} options={PERIODS} />
          </div>
          <Panel title={`Spend by ${grain}`}>
            <MoneyBars data={chart} height="sm" />
          </Panel>
        </div>
      </div>

      {(bucket === "all" || bucket === "salary" || bucket === "reimbursement") ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {bucket === "all" || bucket === "salary" ? (
            <section className="surface-card p-3.5 md:p-4">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">Salary by employee</h2>
                  <p className="text-xs text-muted-foreground">Posted payroll for the selected period</p>
                </div>
                <button className="btn-secondary h-8 text-xs" onClick={() => postPayroll.mutate()} disabled={postPayroll.isPending}>
                  {postPayroll.isPending ? "Posting…" : "Post this month"}
                </button>
              </div>
              {postPayroll.isError ? <p className="mb-2 text-sm text-negative">{(postPayroll.error as Error).message}</p> : null}
              <DataTable
                rows={(br?.salary_by_employee.length ? br.salary_by_employee : (emps?.items || []).map((e) => ({ ...e, employee: e.name, amount: e.monthly_salary }))) as unknown as Record<string, unknown>[]}
                empty="No salary posted."
                columns={[
                  { key: "employee", label: "Employee", render: (r) => String(r.employee || r.name || "") },
                  { key: "amount", label: "Salary", align: "right", render: (r) => inr(Number(r.amount || r.monthly_salary), false) },
                ]}
              />
            </section>
          ) : null}

          {bucket === "all" || bucket === "reimbursement" ? (
            <section className="surface-card p-3.5 md:p-4">
              <h2 className="mb-0.5 text-sm font-semibold tracking-tight">Reimbursements by employee</h2>
              <p className="mb-2.5 text-xs text-muted-foreground">Monthly claims vs camp claims</p>
              <DataTable
                rows={(br?.reimbursements_by_employee || []) as unknown as Record<string, unknown>[]}
                empty="No reimbursements in this period."
                columns={[
                  { key: "employee", label: "Employee" },
                  { key: "monthly", label: "Monthly", align: "right", render: (r) => inr(Number(r.monthly), false) },
                  { key: "camp", label: "Camp", align: "right", render: (r) => inr(Number(r.camp), false) },
                  { key: "claimed", label: "Claimed", align: "right", render: (r) => inr(Number(r.claimed ?? r.total), false) },
                  { key: "approved", label: "Approved", align: "right", render: (r) => inr(Number(r.approved || 0), false) },
                  { key: "paid", label: "Paid", align: "right", render: (r) => inr(Number(r.paid || 0), false) },
                  { key: "pending", label: "Pending", align: "right", render: (r) => inr(Number(r.pending || 0), false) },
                  { key: "total", label: "Total", align: "right", render: (r) => inr(Number(r.total), false) },
                ]}
              />
            </section>
          ) : null}
        </div>
      ) : null}

      {bucket === "all" || bucket === "subscription" ? (
        <section className="surface-card mt-3 p-3.5 md:p-4">
          <h2 className="mb-0.5 text-sm font-semibold tracking-tight">AI & software subscriptions</h2>
          <p className="mb-2.5 text-xs text-muted-foreground">Cursor, Claude, Figma — add any other tool as an expense</p>
          <DataTable
            rows={(br?.subscriptions || []) as unknown as Record<string, unknown>[]}
            empty="No subscriptions yet. Add Cursor, Claude or Figma from Add expense."
            columns={[
              { key: "date", label: "Date" },
              { key: "tool", label: "Tool" },
              { key: "description", label: "Description" },
              { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
              { key: "status", label: "Status" },
            ]}
          />
        </section>
      ) : null}

      <section className="mt-3">
        <h2 className="mb-2 text-sm font-semibold">All entries</h2>
        <DataTable
          rows={rows as unknown as Record<string, unknown>[]}
          empty="Nothing in this filter yet."
          columns={[
            { key: "date", label: "Date" },
            { key: "type", label: "Type", render: (r) => <Pill>{String(r.type)}</Pill> },
            { key: "who", label: "Who / camp" },
            { key: "category", label: "For" },
            { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
            { key: "status", label: "Status" },
            {
              key: "id",
              label: "",
              align: "right",
              render: (r) => {
                if (r.source === "expense" && r.status === "submitted") {
                  return <button className="text-xs font-semibold text-primary" onClick={() => approveExp.mutate(String(r.id))}>Approve</button>;
                }
                if (r.source === "reimbursement" && r.status === "submitted") {
                  return <button className="text-xs font-semibold text-primary" onClick={() => approveRe.mutate(String(r.id))}>Approve</button>;
                }
                if (r.source === "reimbursement" && r.status === "approved") {
                  return <button className="text-xs font-semibold text-primary" onClick={() => payRe.mutate(String(r.id))}>Pay</button>;
                }
                return null;
              },
            },
          ]}
        />
      </section>
    </div>
  );
}
