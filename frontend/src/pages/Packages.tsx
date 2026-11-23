import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { inr, pct } from "../lib/format";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/AppShell";
import { PackageForm } from "../components/MoneyForms";

type Pkg = {
  package_id: string;
  name: string;
  selling_price: number;
  total_variable_cost: number;
  contribution_profit: number;
  contribution_margin: number;
  units_sold: number;
  actual_revenue: number;
  actual_margin: number;
  diagnostic_cost: number;
  consultation_cost: number;
  operations: number;
  payment_gateway: number;
  profit_at_10: number;
  profit_at_50: number;
  profit_at_100: number;
};

export function Packages() {
  const { data } = useQuery({ queryKey: ["packages"], queryFn: () => api<{ items: Pkg[] }>("/packages") });
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Pkg | null>(null);
  const [discount, setDiscount] = useState(0);
  const [costUp, setCostUp] = useState(0);
  const scenario = useMutation({
    mutationFn: () =>
      api<Pkg>(`/packages/${sel?.package_id}/scenario?discount_pct=${discount}&partner_cost_increase_pct=${costUp}`, { method: "POST" }),
  });

  const rows = data?.items || [];
  return (
    <div>
      <PageHeader
        title="Packages"
        subtitle="Unit economics from selling price minus variable costs. Actuals from posted sales."
        actions={<button className="h-9 rounded-md bg-sf-primary px-3 text-sm text-white" onClick={() => setOpen((v) => !v)}>New package</button>}
      />
      {open ? <PackageForm onDone={() => setOpen(false)} /> : null}
      <DataTable
        rows={rows.map((r) => ({ ...r, id: r.package_id }))}
        onRow={(r) => {
          setSel(r as Pkg);
          scenario.reset();
        }}
        empty="Add your first package."
        columns={[
          { key: "name", label: "Package" },
          { key: "selling_price", label: "Price", align: "right", render: (r) => inr(r.selling_price, false) },
          { key: "total_variable_cost", label: "Variable cost", align: "right", render: (r) => inr(r.total_variable_cost, false) },
          { key: "contribution_margin", label: "Unit margin", align: "right", render: (r) => pct(r.contribution_margin) },
          { key: "units_sold", label: "Sold", align: "right" },
          { key: "actual_revenue", label: "Revenue", align: "right", render: (r) => inr(r.actual_revenue) },
          { key: "actual_margin", label: "Actual margin", align: "right", render: (r) => pct(r.actual_margin) },
        ]}
      />
      {sel ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-sf-border bg-sf-card p-4 text-sm">
            <div className="font-medium">{sel.name}</div>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <dt className="text-sf-muted">Selling price</dt><dd className="num text-right">{inr(sel.selling_price, false)}</dd>
              <dt className="text-sf-muted">Diagnostic partner</dt><dd className="num text-right">{inr(sel.diagnostic_cost, false)}</dd>
              <dt className="text-sf-muted">Consultation</dt><dd className="num text-right">{inr(sel.consultation_cost, false)}</dd>
              <dt className="text-sf-muted">Operations</dt><dd className="num text-right">{inr(sel.operations, false)}</dd>
              <dt className="text-sf-muted">Gateway</dt><dd className="num text-right">{inr(sel.payment_gateway, false)}</dd>
              <dt className="font-medium">Contribution</dt><dd className="num text-right font-medium">{inr(sel.contribution_profit, false)} ({pct(sel.contribution_margin)})</dd>
            </dl>
            <p className="mt-3 text-xs text-sf-muted">Profit at 10 / 50 / 100 sales: {inr(sel.profit_at_10)} · {inr(sel.profit_at_50)} · {inr(sel.profit_at_100)}</p>
          </div>
          <div className="rounded-lg border border-sf-border bg-sf-card p-4 text-sm">
            <div className="font-medium">Scenario</div>
            <label className="mt-3 block">Discount {discount}%
              <input type="range" min={0} max={30} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="w-full" />
            </label>
            <label className="mt-3 block">Partner cost +{costUp}%
              <input type="range" min={0} max={40} value={costUp} onChange={(e) => setCostUp(Number(e.target.value))} className="w-full" />
            </label>
            <button className="mt-3 h-9 rounded-md bg-sf-primary px-3 text-white" onClick={() => scenario.mutate()}>
              Recalculate
            </button>
            {scenario.data ? (
              <p className="mt-3">New contribution {inr(scenario.data.contribution_profit, false)} ({pct(scenario.data.contribution_margin)})</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
