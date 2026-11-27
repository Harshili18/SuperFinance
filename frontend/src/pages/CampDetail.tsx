import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { inr, pct } from "../lib/format";
import { PageHeader } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { CampTravellerForm, ExpenseForm, RevenueForm, UploadBox } from "../components/MoneyForms";
import { Chips, Pill, Section } from "../components/FormKit";

type Claim = {
  id: string;
  employee: string;
  date: string;
  kind: string;
  category: string;
  amount: number;
  status: string;
  description: string;
};

type Traveller = {
  employee_id: string;
  employee: string;
  stay: number;
  travel: number;
  food: number;
  other: number;
  total: number;
  status: string;
};

type Detail = {
  name: string;
  camp_number: string;
  client: string | null;
  city: string | null;
  location: string | null;
  date: string;
  status: string;
  attendees: number;
  revenue: number;
  direct_cost: number;
  allocated_cost: number;
  total_cost: number;
  net_profit: number;
  margin: number;
  roi: number;
  contribution?: number;
  travellers: Traveller[];
  camp_claims: Claim[];
  monthly_claims: Claim[];
  camp_reimb_total: number;
  monthly_reimb_total: number;
  transactions: { id: string; date: string; type: string; category: string; description: string; amount: number }[];
  money_in?: { id: string; date: string; type: string; category: string; description: string; amount: number }[];
  money_out?: { id: string; date: string; type: string; category: string; description: string; amount: number }[];
  cost_mix?: { key: string; amount: number }[];
  analysis?: string[];
};

function ClaimPay({ id, status }: { id: string; status: string }) {
  const qc = useQueryClient();
  const approve = useMutation({
    mutationFn: () => api(`/reimbursements/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const pay = useMutation({
    mutationFn: () => api(`/reimbursements/${id}/pay`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <span className="flex justify-end gap-2">
      {status === "submitted" ? <button className="text-xs font-semibold text-primary" onClick={() => approve.mutate()}>Approve</button> : null}
      {status === "approved" ? <button className="text-xs font-semibold text-primary" onClick={() => pay.mutate()}>Pay</button> : null}
    </span>
  );
}

export function CampDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState("overview");
  const [form, setForm] = useState<"none" | "expense" | "revenue" | "traveller">("none");
  const { data, isLoading, error } = useQuery({ queryKey: ["camp", id], queryFn: () => api<Detail>(`/camps/${id}`) });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading camp…</p>;
  if (error || !data) return <p className="text-sm text-negative">Could not load this camp.</p>;

  const moneyIn = data.money_in || data.transactions.filter((t) => t.type === "revenue");
  const moneyOut = data.money_out || data.transactions.filter((t) => t.type !== "revenue");
  const partnerRows = moneyOut.filter((t) => ["diagnostic", "lab", "lab_partners"].includes(String(t.category || "")));
  const packageRows = moneyIn;

  return (
    <div className="min-w-0 space-y-3">
      <PageHeader
        title={data.name}
        subtitle={`${data.camp_number} · ${data.city || "—"} · ${data.client || "B2C"} · ${data.date}`}
        actions={
          <>
            <button className="btn-secondary h-8 text-xs" onClick={() => setForm("revenue")}>Revenue</button>
            <button className="btn-secondary h-8 text-xs" onClick={() => setForm("expense")}>Expense</button>
            <button className="btn-primary h-8 text-xs" onClick={() => setForm("traveller")}>Camp claim</button>
          </>
        }
      />

      {form !== "none" && id ? (
        <div className="surface-card p-3.5">
          {form === "expense" ? <ExpenseForm campId={id} onDone={() => setForm("none")} /> : null}
          {form === "revenue" ? <RevenueForm campId={id} onDone={() => setForm("none")} /> : null}
          {form === "traveller" ? <CampTravellerForm campId={id} onDone={() => setForm("none")} /> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <KpiCard label="Revenue" kpi={{ value: data.revenue }} />
        <KpiCard label="Direct cost" kpi={{ value: data.direct_cost }} />
        <KpiCard label="Allocated" kpi={{ value: data.allocated_cost }} sub="Not double-counted in company OpEx" />
        <KpiCard label="Profit" kpi={{ value: data.net_profit }} />
        <KpiCard label="ROI" kpi={{ value: data.roi }} format="pct" sub="Profit ÷ investment" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard label="Invoice amount" kpi={{ value: Number((data as Detail & { invoice_amount?: number }).invoice_amount || 0) }} />
        <KpiCard label="Collected" kpi={{ value: Number((data as Detail & { amount_collected?: number }).amount_collected || 0) }} />
        <KpiCard label="Outstanding" kpi={{ value: Number((data as Detail & { outstanding_receivable?: number }).outstanding_receivable || 0) }} />
        <KpiCard label="Expected revenue" kpi={{ value: Number((data as Detail & { expected_revenue?: number }).expected_revenue || 0) }} />
      </div>
      {(data as Detail & { flags?: string[] }).flags?.length ? (
        <p className="text-xs text-warning">
          Flags: {(data as Detail & { flags?: string[] }).flags!.map((f) => f.replace(/_/g, " ")).join(" · ")}
        </p>
      ) : null}

      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { id: "overview", label: "Overview" },
          { id: "revenue", label: "Revenue" },
          { id: "expenses", label: "Expenses" },
          { id: "packages", label: "Package sales" },
          { id: "partners", label: "Diagnostic costs" },
          { id: "staff", label: "Staff & reimbursements" },
          { id: "profit", label: "Profitability" },
          { id: "docs", label: "Documents" },
        ]}
      />

      {tab === "overview" || tab === "profit" ? (
        <Section title="Analysis" hint={`Contribution ${inr(data.contribution ?? data.revenue - data.direct_cost)} · Profit ${pct(data.margin)} · ROI ${pct(data.roi)}`}>
          <ul className="space-y-1 text-sm">
            {(data.analysis || [
              `Camp contribution = revenue − direct costs.`,
              `Camp net profit = revenue − direct − allocated operating costs.`,
              `ROI = net profit / camp investment × 100.`,
            ]).map((line) => (
              <li key={line} className="border-b border-border/70 pb-1 last:border-0">{line}</li>
            ))}
          </ul>
          {data.net_profit < 0 ? <p className="mt-2 text-sm font-semibold text-negative">This camp is loss-making.</p> : null}
        </Section>
      ) : null}

      {tab === "overview" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="Money in">
            <DataTable
              rows={packageRows as unknown as Record<string, unknown>[]}
              empty="No incoming money yet."
              columns={[
                { key: "date", label: "Date" },
                { key: "description", label: "Description" },
                { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
              ]}
            />
          </Section>
          <Section title="Money out" hint="Travel, food, stay, logistics, lab, clinicians, marketing…">
            <DataTable
              rows={moneyOut as unknown as Record<string, unknown>[]}
              empty="No camp costs yet."
              columns={[
                { key: "date", label: "Date" },
                { key: "category", label: "For" },
                { key: "description", label: "Description" },
                { key: "amount", label: "Amount", align: "right", render: (r) => <span className="text-negative">{inr(Number(r.amount), false)}</span> },
              ]}
            />
          </Section>
        </div>
      ) : null}

      {tab === "revenue" || tab === "packages" ? (
        <Section title="Money in">
          <DataTable
            rows={packageRows as unknown as Record<string, unknown>[]}
            empty="No incoming money yet."
            columns={[
              { key: "date", label: "Date" },
              { key: "description", label: "Description" },
              { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
            ]}
          />
        </Section>
      ) : null}

      {tab === "expenses" ? (
        <Section title="Money out" hint="Travel, food, stay, logistics, lab, clinicians, marketing…">
          <DataTable
            rows={moneyOut as unknown as Record<string, unknown>[]}
            empty="No camp costs yet."
            columns={[
              { key: "date", label: "Date" },
              { key: "category", label: "For" },
              { key: "description", label: "Description" },
              { key: "amount", label: "Amount", align: "right", render: (r) => <span className="text-negative">{inr(Number(r.amount), false)}</span> },
            ]}
          />
        </Section>
      ) : null}

      {tab === "partners" ? (
        <Section title="Diagnostic partner costs">
          <DataTable
            rows={partnerRows as unknown as Record<string, unknown>[]}
            empty="No diagnostic costs on this camp."
            columns={[
              { key: "date", label: "Date" },
              { key: "description", label: "Description" },
              { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
            ]}
          />
        </Section>
      ) : null}

      {tab === "overview" || tab === "staff" ? (
        <Section title="Team on this camp" hint="Stay, travel and food — camp reimbursements" actions={<span className="num text-sm font-semibold">{inr(data.camp_reimb_total || 0, false)}</span>}>
          {(data.travellers || []).length ? (
            <div className="space-y-2">
              {data.travellers.map((t) => (
                <div key={t.employee_id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-soft px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.employee}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Stay {inr(t.stay, false)} · Travel {inr(t.travel, false)} · Food {inr(t.food, false)}
                      {t.other ? ` · Other ${inr(t.other, false)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Pill tone="camp">Camp</Pill>
                    <span className="num text-sm font-semibold">{inr(t.total, false)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No travellers yet.</p>
          )}
          {(data.camp_claims || []).some((c) => c.status !== "paid") ? (
            <div className="mt-3">
              <DataTable
                rows={data.camp_claims.filter((c) => c.status !== "paid") as unknown as Record<string, unknown>[]}
                empty=""
                columns={[
                  { key: "employee", label: "Employee" },
                  { key: "category", label: "For" },
                  { key: "amount", label: "Amount", align: "right", render: (r) => inr(Number(r.amount), false) },
                  { key: "status", label: "Status" },
                  { key: "id", label: "", align: "right", render: (r) => <ClaimPay id={String(r.id)} status={String(r.status)} /> },
                ]}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      {tab === "docs" && id ? (
        <Section title="Documents">
          <UploadBox entityType="camp" entityId={id} />
        </Section>
      ) : null}
    </div>
  );
}
