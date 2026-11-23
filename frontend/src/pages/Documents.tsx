import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { UploadBox } from "../components/MoneyForms";

export function Documents() {
  const { data } = useQuery({ queryKey: ["docs"], queryFn: () => api<{ items: Record<string, unknown>[] }>("/documents") });
  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Receipts, invoices, agreements and statements — stored on disk, linked to records."
      />
      <div className="mt-3 max-w-xl">
        <UploadBox entityType="organization" entityId="general" />
      </div>
      <div className="mt-4">
        <DataTable
          rows={data?.items || []}
          empty="Upload files from here or while creating a transaction / camp."
          columns={[
            {
              key: "filename",
              label: "File",
              render: (r) => (
                <a className="font-medium text-primary" href={`/api/v1/documents/${r.id}/download`}>
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
  );
}
