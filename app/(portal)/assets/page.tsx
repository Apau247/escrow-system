"use client";

import { useState } from "react";
import { postAction, useMe, usePortal } from "@/lib/client";
import { Banner, Card, Field, StatusPill } from "@/components/ui";

export default function AssetsPage() {
  const { data, refresh } = usePortal();
  const me = useMe();
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  const a = data.assetFields;

  async function run(id: number, action: "upload" | "verify") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await postAction("/api/actions/document", { id, action });
      setMsg({ tone: "green", text: res.message });
      await refresh();
    } catch (e: any) {
      setMsg({ tone: "red", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const canUpload = me && ["COMPLIANCE_OFFICER", "ESCROW_AGENT", "FINANCE_OFFICER", "ADMIN"].includes(me.role);
  const canVerify = me && ["COMPLIANCE_OFFICER", "ESCROW_AGENT", "ADMIN"].includes(me.role);

  return (
    <div className="space-y-6">
      <Card
        title="Physical Asset Custody"
        subtitle="Dormant custodial holding — all custody data below is an unverified test record"
        right={<StatusPill status="RESTRICTED" />}
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Physical Asset" value={a.physical_asset} />
          <Field label="Purity" value={a.purity} />
          <Field label="Vault Reference" value={a.vault_reference} mono />
          <Field label="Custodial Status" value={a.custodial_status} />
        </dl>
      </Card>

      {msg && <Banner tone={msg.tone === "green" ? "blue" : "red"} title={msg.tone === "green" ? "Document updated" : "Action blocked"}>{msg.text}</Banner>}

      <Card
        title="Asset documentation & custody records"
        subtitle="Disbursement authorization is blocked until every document below reaches VERIFIED."
      >
        <div className="overflow-x-auto">
          <table className="table-base">
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
                  <td className="mono text-xs text-slate-300">{d.reference ?? "—"}</td>
                  <td><StatusPill status={d.status} /></td>
                  <td className="text-xs text-slate-400">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : "—"}</td>
                  <td className="text-xs text-slate-400">{d.verified_at ? new Date(d.verified_at).toLocaleDateString() : "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {d.status === "MISSING" && canUpload && (
                        <button className="btn-secondary !py-1 !text-xs" disabled={busy} onClick={() => run(d.id, "upload")}>Upload</button>
                      )}
                      {d.status === "UPLOADED" && canVerify && (
                        <button className="btn-primary !py-1 !text-xs" disabled={busy} onClick={() => run(d.id, "verify")}>Verify</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Coverage includes asset verification, assay documentation, bar serial numbers, insurance, custody records,
          vault documentation, ownership documentation and the release authorization package. All entries are test
          records until validated by the institution.
        </p>
      </Card>
    </div>
  );
}
