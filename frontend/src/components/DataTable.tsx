type Col<T> = { key: string; label: string; render?: (row: T) => React.ReactNode; align?: "left" | "right" };

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  onRow,
  empty,
}: {
  columns: Col<T>[];
  rows: T[];
  onRow?: (row: T) => void;
  empty?: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-soft px-4 py-8 text-center text-sm text-muted-foreground">
        {empty || "Nothing here yet."}
      </div>
    );
  }
  return (
    <div className="surface-card min-w-0 overflow-hidden">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/80">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`whitespace-nowrap bg-surface-soft/80 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground ${
                    c.align === "right" ? "text-right" : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={(row.id as string) || i}
                onClick={() => onRow?.(row)}
                className={`border-b border-border/50 transition last:border-0 ${
                  onRow ? "cursor-pointer hover:bg-muted/50" : "hover:bg-surface-soft/60"
                }`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`max-w-[240px] truncate px-3 py-2.5 text-foreground/90 ${c.align === "right" ? "num text-right font-medium" : ""}`}
                    title={c.render ? undefined : String(row[c.key] ?? "")}
                  >
                    {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
