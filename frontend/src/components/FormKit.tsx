import { useQuery } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { api, apiUrl } from "../lib/api";

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
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15";

export function PanelForm({
  title,
  onSubmit,
  onCancel,
  children,
  busy,
  submit = "Save",
  extraActions,
}: {
  title: string;
  onSubmit: (e: FormEvent) => void;
  onCancel?: () => void;
  children: ReactNode;
  busy?: boolean;
  submit?: string;
  extraActions?: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="surface-card mb-3 p-3.5 md:p-4">
      <div className="mb-4 text-sm font-semibold tracking-tight">{title}</div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={busy} className="btn-primary">
          {busy ? "Saving…" : submit}
        </button>
        {extraActions}
        {onCancel ? (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function downloadExport(module: string, fmt: "csv" | "xlsx" = "csv", filterQuery = "") {
  // filterQuery from toQuery() already starts with "?" when non-empty
  const path = filterQuery
    ? `/export/${module}${filterQuery}&fmt=${fmt}`
    : `/export/${module}?fmt=${fmt}`;
  window.open(apiUrl(path), "_blank");
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
    ok: "bg-positive/10 text-positive",
    warn: "bg-warning/10 text-warning",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-4 ${map[tone]}`}>
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
          className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-semibold transition ${
            value === o.id
              ? "bg-primary text-primary-foreground shadow-xs"
              : "bg-card text-muted-foreground ring-1 ring-border hover:bg-muted hover:text-foreground"
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
    <section className="surface-card min-w-0 p-3.5 md:p-4">
      <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
          {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
