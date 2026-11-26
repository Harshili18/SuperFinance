import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { api } from "../lib/api";
import { useFilters, type FilterState } from "../lib/filters";

type Lookups = {
  cities: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  packages: { id: string; name: string }[];
};

const periods = [
  ["month", "This month"],
  ["last_month", "Last month"],
  ["quarter", "This quarter"],
  ["year", "This FY / year"],
  ["last_year", "Last year"],
  ["week", "This week"],
  ["today", "Today"],
];

export function FilterBar() {
  const { filters, setFilters } = useFilters();
  const { data } = useQuery({ queryKey: ["lookups"], queryFn: () => api<Lookups>("/lookups") });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function set<K extends keyof FilterState>(k: K, v: FilterState[K]) {
    setFilters({ ...filters, [k]: v || undefined });
  }

  const extra = [filters.city_id, filters.business_model, filters.channel, filters.client_id, filters.package_id].filter(Boolean).length;
  const sel =
    "h-9 w-full rounded-xl border border-input bg-card px-2.5 text-xs outline-none transition focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15";

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} className="relative flex shrink-0 items-center gap-2">
      <select
        className="h-9 max-w-[148px] rounded-xl border border-input bg-card px-2.5 text-xs font-medium outline-none transition focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
        value={filters.period}
        onChange={(e) => set("period", e.target.value)}
      >
        {periods.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition ${
          open || extra
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <SlidersHorizontal size={13} />
        Filters{extra ? ` · ${extra}` : ""}
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-40 w-72 space-y-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-soft">
          <p className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Refine view</p>
          <select className={sel} value={filters.city_id || ""} onChange={(e) => set("city_id", e.target.value)}>
            <option value="">All cities</option>
            {data?.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={sel} value={filters.business_model || ""} onChange={(e) => set("business_model", e.target.value)}>
            <option value="">B2B + B2C</option>
            <option value="b2b">B2B</option>
            <option value="b2c">B2C</option>
          </select>
          <select className={sel} value={filters.channel || ""} onChange={(e) => set("channel", e.target.value)}>
            <option value="">All channels</option>
            <option value="camp">Camp</option>
            <option value="app">App</option>
            <option value="b2b">B2B</option>
            <option value="consultation">Consultation</option>
          </select>
          <select className={sel} value={filters.client_id || ""} onChange={(e) => set("client_id", e.target.value)}>
            <option value="">All clients</option>
            {data?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={sel} value={filters.package_id || ""} onChange={(e) => set("package_id", e.target.value)}>
            <option value="">All packages</option>
            {data?.packages.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {extra ? (
            <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setFilters({ period: filters.period })}>
              Clear extra filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
