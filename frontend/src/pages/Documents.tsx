import { useQuery } from "@tanstack/react-query";
import { api, apiUrl } from "../lib/api";
import { PageHeader } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { UploadBox } from "../components/MoneyForms";

export function Documents() {
  const { data } = useQuery({ queryKey: ["docs"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/documents") });
  return (
    <div className="space-y-3">
      <PageHeader
        title="Documents"
        subtitle="Receipts, invoices, agreements and statements — stored on disk, linked to records."
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="surface-card p-3.5 md:p-4">
          <h2 className="mb-2 text-sm font-semibold tracking-tight">Upload</h2>
          <UploadBox entityType="organization" entityId="general" />
        </div>
        <div className="min-w-0">
          <DataTable
            rows={data?.items || []}
            empty="Upload files from here or while creating a transaction / camp."
            columns={[
              {
                key: "filename",
                label: "File",
                render: (r) => (
                  <a className="font-medium text-primary" href={apiUrl(`/documents/${r.id}/download`)}>
                    {String(r.filename)}
                  </a>
                ),
              },
              { key: "entity_type", label: "Linked to" },
              { key: "entity_id", label: "Record" },
              { key: "size", label: "Size", align: "right", render: (r) => `${Math.round(Number(r.size_bytes || r.size || 0) / 1024)} KB` },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
