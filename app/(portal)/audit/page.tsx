"use client";

import { useEffect, useState } from "react";
import { Badge, Banner, Card } from "@/components/ui";

export default function AuditPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => setData({ audit: j.audit, chain: j.chain, anomalies: j.anomalies }))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Banner tone="red" title="Failed to load audit log">{error}</Banner>;
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  const { audit, chain, anomalies } = data;

  return (
    <div className="space-y-6">
      <Banner tone={chain.valid ? "blue" : "red"} title={chain.valid ? `Audit chain integrity VERIFIED — ${chain.entriesChecked} hash-linked entries` : `TAMPERING DETECTED at sequence ${chain.firstBrokenAtSeq}`}>
        Entries are append-only and each commits to the SHA-256 hash of its predecessor. No administrator can silently
        alter an escrow balance, obligation amount, certificate or release status without generating a linked,
        verifiable record here.
      </Banner>

      {anomalies?.length > 0 && (
        <Card title="Fraud & transaction monitoring — active alerts">
          <ul className="space-y-2">
            {anomalies.map((a: any) => (
              <li key={a.actor_email} className="flex items-center gap-3 text-sm text-amber-200">
                <Badge tone="red">BURST</Badge> {a.actor_email} performed {a.count} audited actions within the last
                minute.
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Immutable audit log" subtitle="Most recent 200 entries (chronological, newest first)">
        <div className="max-h-[70vh] overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Seq</th>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a: any) => (
                <tr key={a.seq}>
                  <td className="mono text-slate-500">{a.seq}</td>
                  <td className="mono whitespace-nowrap text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="text-xs">
                    <p className="text-slate-200">{a.actor_email ?? "SYSTEM"}</p>
                    <p className="text-slate-500">{a.actor_role}</p>
                  </td>
                  <td><Badge tone={String(a.action).includes("FAIL") || String(a.action).includes("AUTO") ? "amber" : "slate"}>{a.action}</Badge></td>
                  <td className="mono text-xs text-slate-300">{a.entity_type}{a.entity_id ? `:${a.entity_id}` : ""}</td>
                  <td className="mono max-w-md truncate text-[11px] text-slate-400" title={a.details}>{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
