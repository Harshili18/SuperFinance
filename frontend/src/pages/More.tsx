import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { toQuery, useFilters } from "../lib/filters";
import { inr, pct } from "../lib/format";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/AppShell";
import { KpiCard } from "../components/KpiCard";
import { MoneyLine, MoneyPie, Panel } from "../components/Charts";
import type { Kpi } from "../lib/api";
import { Chips, Pill, downloadExport } from "../components/FormKit";
import { ClinicianForm, ClinicianPayoutForm, ExpenseForm, InvoiceForm, MonthlyClaimForm, PartnerForm, PaymentForm, RevenueForm, UploadBox } from "../components/MoneyForms";
import { Profitability } from "./Profitability";

type MoneyRow = {
  id: string;
  date: string;
  who: string;
  type: string;
  typeKey: string;
  category: string;
  description: string;
  amount: number;
  status: string;
  source: "expense" | "reimbursement";
};

export function Expenses() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<"none" | "bill" | "monthly">("none");
  const [chip, setChip] = useState("all");
  const { data } = useQuery({ queryKey: ["expenses"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/expenses") });
  const { data: reimb } = useQuery({ queryKey: ["reimb"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/reimbursements") });
  const approveExp = useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
  const approveRe = useMutation({
    mutationFn: (id: string) => api(`/reimbursements/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reimb"] }),
  });
  const payRe = useMutation({
    mutationFn: (id: string) => api(`/reimbursements/${id}/pay`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reimb"] }),
  });

  const bills: MoneyRow[] = (data?.items || []).map((e) => {
    const cat = String(e.category || "");
    const typeKey = e.clinician_id ? (cat === "nutritionists" ? "nutritionist" : "doctor") : "bill";
    return {
      id: String(e.id),
      date: String(e.date),
      who: String(e.clinician || e.camp || "—"),
      type: typeKey === "doctor" ? "Doctor" : typeKey === "nutritionist" ? "Nutritionist" : "Bill",
      typeKey,
      category: cat,
      description: String(e.description || ""),
      amount: Number(e.amount),
      status: String(e.status),
      source: "expense",
    };
  });
  const claims: MoneyRow[] = (reimb?.items || []).map((r) => {
    const kind = String(r.kind || "monthly");
    return {
      id: String(r.id),
      date: String(r.date),
      who: String(r.employee || "—"),
      type: kind === "camp" ? "Camp reimbursement" : "Monthly reimbursement",
      typeKey: kind,
      category: String(r.category),
      description: String(r.description || r.camp || ""),
      amount: Number(r.amount),
      status: String(r.status),
      source: "reimbursement",
    };
  });
  const rows = [...bills, ...claims].sort((a, b) => (a.date < b.date ? 1 : -1));
  const shown = chip === "all" ? rows : rows.filter((r) => r.typeKey === chip || (chip === "clinician" && (r.typeKey === "doctor" || r.typeKey === "nutritionist")));

  return (
    <div className="min-w-0">
      <PageHeader
        title="Expenses"
        subtitle="Bills, camp claims and monthly reimbursements — one list."
        actions={
          <>
            <button className="h-9 rounded-md border border-border px-3 text-sm" onClick={() => setOpen("monthly")}>Monthly claim</button>
            <button className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" onClick={() => setOpen("bill")}>Add bill</button>
          </>
        }
      />
      {open === "bill" ? <div className="mt-4"><ExpenseForm onDone={() => setOpen("none")} /></div> : null}
      {open === "monthly" ? <div className="mt-4"><MonthlyClaimForm onDone={() => setOpen("none")} /></div> : null}
      <div className="my-4">
        <Chips
          value={chip}
          onChange={setChip}
          options={[
            { id: "all", label: "All" },
            { id: "bill", label: "Bills" },
            { id: "camp", label: "Camp" },
            { id: "monthly", label: "Monthly" },
            { id: "clinician", label: "Clinicians" },
          ]}
        />
      </div>
      <DataTable
        rows={shown as unknown as Record<string, unknown>[]}
        empty="Nothing in this filter yet."
        columns={[
          { key: "date", label: "Date" },
          {
            key: "type",
            label: "Type",
            render: (r) => (
              <Pill tone={r.typeKey === "camp" ? "camp" : r.typeKey === "monthly" ? "monthly" : "muted"}>
                {String(r.type)}
              </Pill>
            ),
          },
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
      <CsvImport />
    </div>
  );
}

function CsvImport() {
  const qc = useQueryClient();
  return (
    <div className="mt-6 text-sm">
      <div className="font-medium">Import expenses CSV</div>
      <p className="text-sf-muted">Columns: date, amount, category, description (optional)</p>
      <input
        type="file"
        accept=".csv,.xlsx"
        className="mt-2 text-sm"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.append("file", file);
          const path = file.name.toLowerCase().endsWith(".xlsx") ? "/import/expenses-xlsx" : "/import/expenses";
          await api(path, { method: "POST", body: fd });
          qc.invalidateQueries({ queryKey: ["expenses"] });
        }}
      />
    </div>
  );
}

export function Invoices() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["invoices"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/invoices") });
  const send = useMutation({
    mutationFn: (id: string) => api(`/invoices/${id}/send`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Sending an invoice posts revenue and accounts receivable."
        actions={
          <div className="flex gap-2">
            <button className="h-9 rounded-md border border-sf-border px-3 text-sm" onClick={() => downloadExport("invoices")}>Export CSV</button>
            <button className="h-9 rounded-md bg-sf-primary px-3 text-sm text-white" onClick={() => setOpen((v) => !v)}>New invoice</button>
          </div>
        }
      />
      {open ? <InvoiceForm onDone={() => setOpen(false)} /> : null}
      <DataTable
        rows={data?.items || []}
        empty="No invoices yet."
        columns={[
          { key: "number", label: "Number" },
          { key: "client", label: "Client" },
          { key: "date", label: "Date" },
          { key: "due_date", label: "Due" },
          { key: "total", label: "Total", align: "right", render: (r) => inr(Number(r.total), false) },
          { key: "outstanding", label: "Due", align: "right", render: (r) => inr(Number(r.outstanding), false) },
          { key: "status", label: "Status" },
          {
            key: "id",
            label: "",
            render: (r) => (
              <span className="flex gap-2">
                {r.status === "draft" ? (
                  <button className="text-sf-primary" onClick={() => send.mutate(String(r.id))}>Send</button>
                ) : null}
                <a className="text-sf-primary" href={`/api/v1/invoices/${r.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

export function Payments() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["payments"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/payments") });
  const { data: ar } = useQuery({ queryKey: ["ar"], queryFn: () => api<{ total: number; buckets: Record<string, number> }>("/reports/receivables") });
  return (
    <div>
      <PageHeader
        title="Payments & receivables"
        actions={<button className="h-9 rounded-md bg-sf-primary px-3 text-sm text-white" onClick={() => setOpen((v) => !v)}>Record payment</button>}
      />
      {open ? <PaymentForm onDone={() => setOpen(false)} /> : null}
      {ar ? (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Total AR" kpi={{ value: ar.total }} />
          <KpiCard label="Current" kpi={{ value: ar.buckets.current }} />
          <KpiCard label="1–30" kpi={{ value: ar.buckets["1_30"] }} />
          <KpiCard label="31–60" kpi={{ value: ar.buckets["31_60"] }} />
          <KpiCard label="90+" kpi={{ value: ar.buckets["90_plus"] }} />
        </div>
      ) : null}
      <DataTable
        rows={data?.items || []}
        empty="No payments recorded."
        columns={[
          { key: "date", label: "Date" },
          { key: "direction", label: "In/Out" },
          { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
          { key: "method", label: "Method" },
          { key: "reference", label: "Reference" },
        ]}
      />
    </div>
  );
}

export function Revenue() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["revenue"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/revenue") });
  return (
    <div>
      <PageHeader
        title="Revenue"
        subtitle="Every row is a posted revenue transaction."
        actions={<button className="h-9 rounded-md bg-sf-primary px-3 text-sm text-white" onClick={() => setOpen((v) => !v)}>Record revenue</button>}
      />
      {open ? <RevenueForm onDone={() => setOpen(false)} /> : null}
      <DataTable
        rows={data?.items || []}
        empty="No revenue posted yet."
        columns={[
          { key: "date", label: "Date" },
          { key: "channel", label: "Channel" },
          { key: "description", label: "Description" },
          { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
          { key: "status", label: "Payment" },
        ]}
      />
    </div>
  );
}

export function Partners() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["partners"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/partners") });
  return (
    <div>
      <PageHeader
        title="Diagnostic partners"
        subtitle="Margin = revenue generated on that partner’s tests − payout."
        actions={<button className="h-9 rounded-md bg-sf-primary px-3 text-sm text-white" onClick={() => setOpen((v) => !v)}>Add partner</button>}
      />
      {open ? <PartnerForm onDone={() => setOpen(false)} /> : null}
      <DataTable
        rows={data?.items || []}
        empty="Add a diagnostic partner."
        columns={[
          { key: "name", label: "Partner" },
          { key: "partner_type", label: "Type" },
          { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(Number(r.revenue)) },
          { key: "payout", label: "Payout", align: "right", render: (r) => inr(Number(r.payout)) },
          { key: "contribution", label: "Contribution", align: "right", render: (r) => inr(Number(r.contribution)) },
          { key: "margin", label: "Margin", align: "right", render: (r) => pct(Number(r.margin)) },
        ]}
      />
    </div>
  );
}

export function Clinicians() {
  const [kind, setKind] = useState<"doctor" | "nutritionist">("doctor");
  const [open, setOpen] = useState<"none" | "add" | string>("none");
  const { data } = useQuery({ queryKey: ["clinicians"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/clinicians") });
  const rows = (data?.items || []).filter((r) => r.kind === kind);
  const paying = typeof open === "string" && open !== "none" && open !== "add" ? rows.find((r) => r.id === open) : null;
  return (
    <div className="min-w-0">
      <PageHeader
        title="Doctors & Nutritionists"
        subtitle="People we pay for camps and consults — not on payroll."
        actions={<button className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" onClick={() => setOpen("add")}>Add {kind === "doctor" ? "doctor" : "nutritionist"}</button>}
      />
      <div className="my-4">
        <Chips
          value={kind}
          onChange={(v) => setKind(v as "doctor" | "nutritionist")}
          options={[
            { id: "doctor", label: "Doctors" },
            { id: "nutritionist", label: "Nutritionists" },
          ]}
        />
      </div>
      {open === "add" ? <ClinicianForm kind={kind} onDone={() => setOpen("none")} /> : null}
      {paying ? <ClinicianPayoutForm clinicianId={String(paying.id)} typicalFee={Number(paying.typical_fee || 0)} onDone={() => setOpen("none")} /> : null}
      <DataTable
        rows={rows}
        empty={kind === "doctor" ? "No doctors yet." : "No nutritionists yet."}
        columns={[
          { key: "name", label: "Name" },
          { key: "specialty", label: "Specialty" },
          { key: "typical_fee", label: "Typical fee", align: "right", render: (r) => inr(Number(r.typical_fee), false) },
          { key: "paid", label: "Paid YTD", align: "right", render: (r) => inr(Number(r.paid), false) },
          {
            key: "id",
            label: "",
            align: "right",
            render: (r) => (
              <button className="text-xs font-semibold text-primary" onClick={() => setOpen(String(r.id))}>
                Pay
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

export function Employees() {
  const [open, setOpen] = useState(false);
  const [chip, setChip] = useState("monthly");
  const { data } = useQuery({ queryKey: ["employees"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/employees") });
  const { data: reimb } = useQuery({ queryKey: ["reimb"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/reimbursements") });
  const qc = useQueryClient();
  const approve = useMutation({
    mutationFn: (id: string) => api(`/reimbursements/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reimb"] }),
  });
  const pay = useMutation({
    mutationFn: (id: string) => api(`/reimbursements/${id}/pay`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reimb"] }),
  });
  const claims = (reimb?.items || []).filter((r) => chip === "all" || r.kind === chip);
  return (
    <div className="min-w-0">
      <PageHeader
        title="Employees"
        subtitle="Payroll and reimbursements. Camp claims live on the camp too."
        actions={<button className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" onClick={() => setOpen((v) => !v)}>Monthly claim</button>}
      />
      {open ? <MonthlyClaimForm onDone={() => setOpen(false)} /> : null}
      <PayrollBar />
      <DataTable
        rows={data?.items || []}
        empty="No employees."
        columns={[
          { key: "code", label: "ID" },
          { key: "name", label: "Name" },
          { key: "department", label: "Dept" },
          { key: "designation", label: "Role" },
          { key: "monthly_salary", label: "Salary", align: "right", render: (r) => inr(Number(r.monthly_salary), false) },
        ]}
      />
      <h2 className="mb-3 mt-8 text-sm font-medium">Reimbursements</h2>
      <div className="mb-3">
        <Chips
          value={chip}
          onChange={setChip}
          options={[
            { id: "monthly", label: "Monthly" },
            { id: "camp", label: "Camp" },
            { id: "all", label: "All" },
          ]}
        />
      </div>
      <DataTable
        rows={claims}
        empty="No claims in this view."
        columns={[
          { key: "date", label: "Date" },
          {
            key: "kind",
            label: "Type",
            render: (r) => <Pill tone={r.kind === "camp" ? "camp" : "monthly"}>{r.kind === "camp" ? "Camp reimbursement" : "Monthly reimbursement"}</Pill>,
          },
          { key: "employee", label: "Employee" },
          { key: "category", label: "For" },
          { key: "camp", label: "Camp" },
          { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
          { key: "status", label: "Status" },
          {
            key: "id",
            label: "",
            align: "right",
            render: (r) => (
              <span className="flex justify-end gap-2">
                {r.status === "submitted" ? <button className="text-xs font-semibold text-primary" onClick={() => approve.mutate(String(r.id))}>Approve</button> : null}
                {r.status === "approved" ? <button className="text-xs font-semibold text-primary" onClick={() => pay.mutate(String(r.id))}>Pay</button> : null}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

export function AppRevenue() {
  const { data } = useQuery({
    queryKey: ["app-rev"],
    queryFn: () =>
      api<{ revenue: number; transactions: number; aov: number; cogs: number; contribution: number; margin: number; monthly: { month: string; amount: number }[] }>(
        "/app-revenue",
      ),
  });
  if (!data) return <p className="text-sf-muted">Loading app revenue…</p>;
  return (
    <div>
      <PageHeader title="App revenue" subtitle="Channel = app. No clinical data stored." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="App revenue" kpi={{ value: data.revenue }} />
        <KpiCard label="Transactions" kpi={{ value: data.transactions }} format="number" />
        <KpiCard label="AOV" kpi={{ value: data.aov }} />
        <KpiCard label="Contribution" kpi={{ value: data.contribution }} />
      </div>
      <div className="mt-6">
        <Panel title="Monthly app revenue">
          <MoneyLine data={data.monthly} />
        </Panel>
      </div>
    </div>
  );
}

export function Budgets() {
  const { filters } = useFilters();
  const { data } = useQuery({
    queryKey: ["budgets", filters],
    queryFn: () => api<{ category: string; budget: number; actual: number; variance: number; variance_pct: number }[]>(`/reports/budgets${toQuery(filters)}`),
  });
  return (
    <div>
      <PageHeader title="Budgets" subtitle="Variance = actual − budget. Red means overspend." />
      <DataTable
        rows={(data || []).map((r) => ({ ...r, id: r.category }))}
        empty="No budget lines for this period."
        columns={[
          { key: "category", label: "Category" },
          { key: "budget", label: "Budget", align: "right", render: (r) => inr(r.budget) },
          { key: "actual", label: "Actual", align: "right", render: (r) => inr(r.actual) },
          {
            key: "variance",
            label: "Variance",
            align: "right",
            render: (r) => <span className={r.variance > 0 ? "text-sf-accent" : "text-sf-success"}>{inr(r.variance)}</span>,
          },
          { key: "variance_pct", label: "%", align: "right", render: (r) => pct(r.variance_pct) },
        ]}
      />
    </div>
  );
}

export function Reports() {
  const { filters } = useFilters();
  const { data: pnl } = useQuery({ queryKey: ["pnl", filters], queryFn: () => api<Record<string, unknown>>(`/reports/pnl${toQuery(filters)}`) });
  const { data: cf } = useQuery({ queryKey: ["cf", filters], queryFn: () => api<Record<string, number>>(`/reports/cashflow${toQuery(filters)}`) });
  return (
    <div>
      <PageHeader
        title="Overall P&L"
        subtitle="Profit and loss and cash flow from posted journal activity."
        actions={<button className="h-9 rounded-md border border-sf-border px-3 text-sm" onClick={() => downloadExport("pnl")}>Export P&L</button>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-sf-border bg-sf-card p-4 text-sm">
          <div className="font-medium">Profit & loss</div>
          {pnl ? (
            <dl className="mt-3 space-y-1">
              <Row k="Total revenue" v={Number(pnl.total_revenue)} />
              <Row k="Direct costs" v={Number(pnl.total_cogs)} />
              <Row k="Gross profit" v={Number(pnl.gross_profit)} />
              <div className="text-sf-muted">Gross margin {pct(Number(pnl.gross_margin))}</div>
              <Row k="Operating expenses" v={Number(pnl.total_opex)} />
              <Row k="EBITDA" v={Number(pnl.ebitda)} />
              <Row k="Net profit" v={Number(pnl.net_profit)} />
            </dl>
          ) : null}
        </div>
        <div className="rounded-lg border border-sf-border bg-sf-card p-4 text-sm">
          <div className="font-medium">Cash flow</div>
          {cf ? (
            <dl className="mt-3 space-y-1">
              <Row k="Opening cash" v={cf.opening_cash} />
              <Row k="Inflows" v={cf.cash_inflows} />
              <Row k="Outflows" v={cf.cash_outflows} />
              <Row k="Operating CF" v={cf.operating_cash_flow} />
              <Row k="Closing cash" v={cf.closing_cash} />
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between border-b border-sf-border/60 py-1">
      <dt>{k}</dt>
      <dd className="num">{inr(v, false)}</dd>
    </div>
  );
}

function PayrollBar() {
  const qc = useQueryClient();
  const now = new Date();
  const post = useMutation({
    mutationFn: () => api(`/payroll?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-sf-border bg-sf-card px-4 py-3 text-sm">
      <span>Post this month’s salary tracking entry (not statutory payroll).</span>
      <button className="h-9 rounded-md border border-sf-border px-3" onClick={() => post.mutate()} disabled={post.isPending}>
        {post.isPending ? "Posting…" : "Post payroll"}
      </button>
      {post.isError ? <span className="text-sf-accent">{(post.error as Error).message}</span> : null}
    </div>
  );
}

export function Documents() {
  const { data } = useQuery({ queryKey: ["docs"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/documents") });
  return (
    <div>
      <PageHeader title="Documents" subtitle="Files are stored on disk, not as database blobs." />
      <div className="mb-4">
        <UploadBox entityType="organization" entityId="general" />
      </div>
      <DataTable
        rows={data?.items || []}
        empty="Upload receipts, contracts, and partner bills from a record page."
        columns={[
          { key: "filename", label: "File", render: (r) => <a className="text-sf-primary" href={`/api/v1/documents/${r.id}/download`}>{String(r.filename)}</a> },
          { key: "entity_type", label: "Linked to" },
          { key: "size", label: "Size", align: "right" },
        ]}
      />
    </div>
  );
}

export function SettingsPage() {
  const { data } = useQuery({
    queryKey: ["periods"],
    queryFn: () => api<{ items: { year: number; month: number; status: string }[] }>("/periods"),
  });
  const qc = useQueryClient();
  const lock = useMutation({
    mutationFn: (p: { year: number; month: number; status: string }) =>
      api(`/periods/${p.year}/${p.month}/${p.status === "locked" ? "unlock" : "lock"}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["periods"] }),
  });
  return (
    <div>
      <PageHeader title="Settings" subtitle="Organization, periods, and security." />
      <div className="rounded-lg border border-sf-border bg-sf-card p-4 text-sm">
        <p>SUPERSSHYFT · INR · Development OTP 424242</p>
        <p className="mt-2 text-sf-muted">Production: set ENVIRONMENT=production, a strong SECRET_KEY, PostgreSQL DATABASE_URL, COOKIE_SECURE=true, and a real SMS provider. Period locking and RBAC are enforced on the API.</p>
      </div>
      <h2 className="mb-3 mt-8 text-sm font-medium">Accounting periods</h2>
      <DataTable
        rows={(data?.items || []).slice(0, 18).map((p) => ({ ...p, id: `${p.year}-${p.month}` }))}
        empty="No periods yet."
        columns={[
          { key: "year", label: "Year" },
          { key: "month", label: "Month" },
          { key: "status", label: "Status" },
          {
            key: "id",
            label: "",
            render: (r) => (
              <button className="text-sf-primary" onClick={() => lock.mutate({ year: Number(r.year), month: Number(r.month), status: String(r.status) })}>
                {r.status === "locked" ? "Reopen" : "Lock"}
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

export function MIS() {
  const { filters } = useFilters();
  const { data } = useQuery({ queryKey: ["executive", filters], queryFn: () => api<{ revenue: Kpi; ebitda: Kpi; charts: { by_city: { label?: string; key: string; amount: number }[] } }>(`/dashboard/executive${toQuery(filters)}`) });
  return (
    <div>
      <PageHeader title="MIS & Analytics" subtitle="Same ledger, sliced for management." />
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
            <KpiCard label="Revenue" kpi={data.revenue} />
            <KpiCard label="EBITDA" kpi={data.ebitda} />
          </div>
          <div className="mt-6">
            <Panel title="City mix">
              <MoneyPie data={(data.charts.by_city || []).map((c) => ({ name: c.label || c.key, value: c.amount }))} />
            </Panel>
          </div>
        </>
      ) : null}
      <div className="mt-8">
        <Profitability embedded />
      </div>
    </div>
  );
}

export function Investor() {
  const { filters } = useFilters();
  const { data } = useQuery({
    queryKey: ["investor", filters],
    queryFn: () =>
      api<{
        kpis: Record<string, Kpi | number | null>;
        mix: { channel: { key: string; amount: number }[]; model: { key: string; amount: number }[] };
        monthly_revenue: { month: string; amount: number }[];
        pnl: { gross_margin: number; ebitda: number; net_profit: number };
      }>(`/dashboard/investor${toQuery(filters)}`),
  });
  if (!data) return <p className="text-sf-muted">Loading investor view…</p>;
  const k = data.kpis;
  return (
    <div>
      <PageHeader title="Investor" subtitle="Growth, margin, cash, burn — not operational clutter." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Revenue" kpi={k.revenue as Kpi} />
        <KpiCard label="Gross margin" kpi={k.gross_margin as Kpi} format="pct" />
        <KpiCard label="EBITDA" kpi={k.ebitda as Kpi} />
        <KpiCard label="Cash" kpi={k.cash_balance as Kpi} />
        <KpiCard label="Burn" kpi={k.burn_rate as Kpi} />
        <KpiCard label="Runway" kpi={{ value: Number(k.runway_months || 0) }} format="number" suffix=" mo" />
        <KpiCard label="Net profit" kpi={k.net_profit as Kpi} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Monthly revenue">
          <MoneyLine data={data.monthly_revenue} />
        </Panel>
        <Panel title="Revenue mix">
          <MoneyPie data={data.mix.channel.map((c) => ({ name: c.key, value: c.amount }))} />
        </Panel>
      </div>
    </div>
  );
}
