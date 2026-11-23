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
    return <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{empty || "Nothing here yet."}</div>;
  }
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-border bg-muted/60 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-3 py-2.5 ${c.align === "right" ? "text-right" : ""}`}>
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
              className={`border-b border-border/70 last:border-0 ${onRow ? "cursor-pointer hover:bg-muted/70" : ""}`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`max-w-[220px] truncate px-3 py-2.5 ${c.align === "right" ? "num text-right" : ""}`}
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
  );
}
