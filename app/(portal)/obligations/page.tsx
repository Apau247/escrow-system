"use client";

import { useAction, useMe, usePortal } from "@/lib/client";
import { Badge, Banner, Card, EmptyState, ErrorState, Loading, Money, StatusPill } from "@/components/ui";

const CHAIN = ["Assessment", "Verification (Finance)", "Compliance Review", "Escrow Agent Approval", "Posting"];

const NEXT_ACTION: Record<string, { action: string; label: string; roles: string[] }> = {
  PENDING_VERIFICATION: { action: "verify", label: "Verify assessment", roles: ["FINANCE_OFFICER", "ADMIN"] },
  VERIFIED: { action: "review", label: "Record compliance review", roles: ["COMPLIANCE_OFFICER", "ADMIN"] },
  COMPLIANCE_REVIEWED: { action: "approve", label: "Approve as Escrow Agent", roles: ["ESCROW_AGENT", "ADMIN"] },
  AGENT_APPROVED: { action: "authorize", label: "Authorize & post charge", roles: ["FINANCE_OFFICER", "ADMIN"] },
};

export default function ObligationsPage() {
  const { data, error, loading, refresh } = usePortal();
  const me = useMe();
  const { run, busy, feedback } = useAction(refresh);

  return (
    <div className="space-y-6">
      <Banner tone="red" title="Release Tax / Obligation - TEST RECORD, NOT A PAYMENT GATE">
        The $17,000.00 USD figure below is a synthetic test record. It is not an assessed or verified tax liability.
        This platform intentionally provides NO self-service payment and NO automatic payment-to-release mechanism:
        the obligation must pass the full institutional chain below before it can affect any balance, and even then
        funds release requires every escrow release condition to be satisfied.
      </Banner>

      <Card title="Required workflow" subtitle="Tax/Charge Assessment → Verification → Compliance Review → Escrow Agent Approval → Disbursement Authorization → Escrow Release">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {CHAIN.map((c, i) => (
            <span key={c} className="flex items-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-slate-200">{c}</span>
              {i < CHAIN.length - 1 && <span className="text-gold-400">→</span>}
            </span>
          ))}
        </div>
      </Card>

      {loading ? (
        <Card title="Obligations register"><Loading label="Loading obligations..." /></Card>
      ) : error || !data ? (
        <ErrorState message={error ?? "No data returned."} onRetry={() => void refresh()} />
      ) : (
        <>
          {feedback && (
            <Banner
              tone={feedback.tone === "success" ? "green" : "red"}
              title={feedback.tone === "success" ? "Action recorded" : "Action blocked"}
              live={feedback.tone === "error" ? "alert" : "status"}
            >
              {feedback.text}
            </Banner>
          )}

          <Card title="Obligations register" subtitle="Currency: USD for all monetary values">
            {data.obligations.length === 0 ? (
              <EmptyState title="No obligations recorded" hint="Assessed tax or charge obligations will appear here." />
            ) : (
              <div className="table-wrap">
                <table className="table-base">
                  <caption className="sr-only">Tax and fee obligations for this escrow account, with status and available actions</caption>
                  <thead>
                    <tr>
                      <th>Obligation</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Purpose</th>
                      <th>Next action (your role)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.obligations.map((o) => {
                      const next = NEXT_ACTION[o.status] as { action: string; label: string; roles: string[] } | undefined;
                      const allowed = !!(next && me && next.roles.includes(me.role));
                      return (
                        <tr key={o.id}>
                          <td>
                            <p className="font-semibold text-white">{o.label}</p>
                            <p className="mt-0.5 text-xs text-slate-400">{o.kind.replaceAll("_", " ")}</p>
                          </td>
                          <td className="mono whitespace-nowrap font-bold text-gold-400"><Money cents={o.amount_cents} /></td>
                          <td><StatusPill status={o.status} /></td>
                          <td className="max-w-xs text-xs text-slate-400">{o.purpose}</td>
                          <td>
                            {allowed && next ? (
                              <button type="button" className="btn-primary !py-1.5 !text-xs" disabled={busy} aria-busy={busy} onClick={() => void run("/api/actions/obligation", { id: o.id, action: next.action })}>
                                {next.label}
                              </button>
                            ) : next ? (
                              <Badge tone="slate">Requires {next.roles.map((r) => r.replaceAll("_", " ")).join(" / ")}</Badge>
                            ) : o.status === "POSTED" ? (
                              <Badge tone="green">Posted to ledger</Badge>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
