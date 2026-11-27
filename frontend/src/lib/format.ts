export function inrExact(n: number | null | undefined): string {
  const v = Number(n || 0);
  const sign = v < 0 ? "-" : "";
  return `${sign}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function inr(n: number | null | undefined, compact = true): string {
  const v = Number(n || 0);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (compact) {
    if (a >= 1_00_00_000) return `${sign}₹${(a / 1_00_00_000).toFixed(2)}Cr`;
    if (a >= 1_00_000) return `${sign}₹${(a / 1_00_000).toFixed(2)}L`;
  }
  return `${sign}₹${a.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(1)}%`;
}

export function delta(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/** Metric definition tooltips (PDF glossary). */
export const METRIC_HELP: Record<string, string> = {
  "Gross profit": "Recognised revenue − direct costs",
  "Gross margin": "Gross profit ÷ recognised revenue × 100",
  EBITDA: "Gross profit − operating expenses (before interest, tax, depreciation and amortisation)",
  "Net profit": "EBITDA − depreciation − interest − tax, where tracked",
  AOV: "Net B2C sales ÷ completed paid orders",
  ROI: "Camp net profit ÷ camp investment (total cost or budget) × 100 — not the same as margin %",
  Receivables: "Outstanding amount on issued invoices (not cash until collected)",
  Payables: "Outstanding amount owed to vendors/others",
  "Closing cash": "Opening cash + cash inflows − cash outflows",
  "Burn / month": "Average gross monthly cash outflow (credits to cash/bank), not net burn",
  Contribution: "Camp or segment revenue − direct costs",
};
