"use client";

import { useAction, useMe, usePortal } from "@/lib/client";
import { Banner, Card, EmptyState, ErrorState, Field, Loading, StatusPill } from "@/components/ui";

export default function AssetsPage() {
  const { data, error, loading, refresh } = usePortal();
  const me = useMe();
  const { run, busy, feedback } = useAction(refresh);

  if (loading) return <Loading label="Loading asset custody records..." />;
  if (error || !data) return <ErrorState message={error ?? "No data returned."} onRetry={() => void refresh()} />;

  const a = data.assetFields;

  async function runDoc(id: number, action: "upload" | "verify") {
    await run("/api/actions/document", { id, action });
  }

  const canUpload = me && ["COMPLIANCE_OFFICER", "ESCROW_AGENT", "FINANCE_OFFICER", "ADMIN"].includes(me.role);
  const canVerify = me && ["COMPLIANCE_OFFICER", "ESCROW_AGENT", "ADMIN"].includes(me.role);

  return (
    <div className="space-y-6">
      <Card
        title="Physical Asset Custody"
        subtitle="Dormant custodial holding - all custody data below is an unverified test record"
        right={<StatusPill status="RESTRICTED" />}
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Physical Asset" value={a.physical_asset} />
          <Field label="Purity" value={a.purity} />
          <Field label="Vault Reference" value={a.vault_reference} mono />
          <Field label="Custodial Status" value={a.custodial_status} />
        </dl>
      </Card>

      {feedback && (
        <Banner
          tone={feedback.tone === "success" ? "green" : "red"}
          title={feedback.tone === "success" ? "Document updated" : "Action blocked"}
          live={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.text}
        </Banner>
      )}

      <Card
        title="Asset documentation & custody records"
        subtitle="Disbursement authorization is blocked until every document below reaches VERIFIED."
      >
        {data.documents.length === 0 ? (
          <EmptyState title="No custody documents recorded" hint="Asset verification and custody documentation will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <caption className="sr-only">Asset documentation and custody records with upload and verification actions</caption>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Document</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                  <th>Verified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.map((d: any) => (
                  <tr key={d.id}>
                    <td className="mono text-xs uppercase text-slate-400">{d.category.replaceAll("_", " ")}</td>
                    <td className="font-medium text-white">{d.title}</td>
                    <td className="mono text-xs text-slate-300">{d.reference ?? "-"}</td>
                    <td><StatusPill status={d.status} /></td>
                    <td className="text-xs text-slate-400">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : "-"}</td>
                    <td className="text-xs text-slate-400">{d.verified_at ? new Date(d.verified_at).toLocaleDateString() : "-"}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {d.status === "MISSING" && canUpload && (
                          <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy} aria-busy={busy} onClick={() => void runDoc(d.id, "upload")}>
                            Upload<span className="sr-only"> {d.title}</span>
                          </button>
                        )}
                        {d.status === "UPLOADED" && canVerify && (
                          <button type="button" className="btn-primary !py-1 !text-xs" disabled={busy} aria-busy={busy} onClick={() => void runDoc(d.id, "verify")}>
                            Verify<span className="sr-only"> {d.title}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Coverage includes asset verification, assay documentation, bar serial numbers, insurance, custody records,
          vault documentation, ownership documentation and the release authorization package. All entries are test
          records until validated by the institution.
        </p>
      </Card>
    </div>
  );
}
