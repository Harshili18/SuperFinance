import { createContext, useContext } from "react";

export type FilterState = {
  period: string;
  date_from?: string;
  date_to?: string;
  city_id?: string;
  client_id?: string;
  camp_id?: string;
  package_id?: string;
  channel?: string;
  business_model?: string;
  diagnostic_partner_id?: string;
};

export function toQuery(f: FilterState): string {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const FilterCtx = createContext<{
  filters: FilterState;
  setFilters: (f: FilterState) => void;
}>({ filters: { period: "month" }, setFilters: () => {} });

export function useFilters() {
  return useContext(FilterCtx);
}
