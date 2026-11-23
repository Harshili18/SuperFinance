import { useQuery } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { api } from "../lib/api";

export type Lookups = {
  cities: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  packages: { id: string; name: string; selling_price?: number }[];
  partners: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  camps: { id: string; name: string }[];
  clinicians?: { id: string; name: string; kind: string }[];
};

export function useLookups() {
  return useQuery({ queryKey: ["lookups"], queryFn: () => api<Lookups>("/lookups") });
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-sf-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function PanelForm({
  title,
  onSubmit,
  onCancel,
  children,
  busy,
  submit = "Save",
}: {
  title: string;
  onSubmit: (e: FormEvent) => void;
  onCancel?: () => void;
  children: ReactNode;
  busy?: boolean;
  submit?: string;
}) {
  return (
    <form onSubmit={onSubmit} className="mb-4 rounded-lg border border-sf-border bg-sf-card p-4">
      <div className="mb-3 text-sm font-medium">{title}</div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
      <div className="mt-4 flex gap-2">
        <button disabled={busy} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? "Saving…" : submit}
        </button>
        {onCancel ? (
          <button type="button" className="h-9 px-3 text-sm text-sf-muted" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function downloadExport(module: string, fmt: "csv" | "xlsx" = "csv") {
  window.open(`/api/v1/export/${module}?fmt=${fmt}`, "_blank");
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "camp" | "monthly" | "muted" | "ok" | "warn";
}) {
  const map = {
    camp: "bg-primary/10 text-primary",
    monthly: "bg-secondary text-secondary-foreground",
    ok: "text-positive bg-muted",
    warn: "text-negative bg-muted",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 ${map[tone]}`}>
      {children}
    </span>
  );
}

export function Chips({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${
            value === o.id ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 min-w-0 rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
