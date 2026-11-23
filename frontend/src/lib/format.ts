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
