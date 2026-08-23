"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Banner, Card, EmptyState, ErrorState, Loading } from "@/components/ui";

interface AuditData {
  audit: any[];
  chain: { valid: boolean; entriesChecked: number; firstBrokenAtSeq: number | null };
  anomalies: Array<{ actor_email: string; count: number }>;
}

export default function AuditPage() {
  const [data, setData] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/portal", { cache: "no-store" });
      const j = await r.json().catch(() => ({}) as any);
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      if (!j || !Array.isArray(j.audit) || !j.chain) throw new Error("Server returned an invalid response. Please retry.");
      setData({ audit: j.audit, chain: j.chain, anomalies: j.anomalies ?? [] });
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Loading label="Loading audit log..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <ErrorState message="No data returned." onRetry={() => void load()} />;

  const { audit, chain, anomalies } = data;

  return (
    <div className="space-y-6">
      <Banner tone={chain.valid ? "blue" : "red"} title={chain.valid ? `Audit chain integrity VERIFIED - ${chain.entriesChecked} hash-linked entries` : `TAMPERING DETECTED at sequence ${chain.firstBrokenAtSeq}`}>
        Entries are append-only and each commits to the SHA-256 hash of its predecessor. No administrator can silently
        alter an escrow balance, obligation amount, certificate or release status without generating a linked,
        verifiable record here.
      </Banner>

      {anomalies.length > 0 && (
        <Card title="Fraud & transaction monitoring - active alerts">
          <ul className="space-y-2">
            {anomalies.map((a) => (
              <li key={a.actor_email} className="flex items-center gap-3 text-sm text-amber-200">
                <Badge tone="red">BURST</Badge> {a.actor_email} performed {a.count} audited actions within the last
                minute.
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Immutable audit log" subtitle="Most recent 200 entries (chronological, newest first)">
        {audit.length === 0 ? (
          <EmptyState title="No audit entries yet" hint="Audited actions will appear here as they occur." />
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-white/10">
            <table className="table-base">
              <caption className="sr-only">Immutable audit log entries with actor, action and entity</caption>
              <thead className="sticky top-0 bg-navy-800">
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
                    <td className="mono text-slate-400">{a.seq}</td>
                    <td className="mono whitespace-nowrap text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="text-xs">
                      <p className="text-slate-200">{a.actor_email ?? "SYSTEM"}</p>
                      <p className="text-slate-400">{a.actor_role}</p>
                    </td>
                    <td><Badge tone={String(a.action).includes("FAIL") || String(a.action).includes("AUTO") ? "amber" : "slate"}>{a.action}</Badge></td>
                    <td className="mono text-xs text-slate-300">{a.entity_type}{a.entity_id ? `:${a.entity_id}` : ""}</td>
                    <td className="mono max-w-md truncate text-[11px] text-slate-400" title={a.details}>{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
