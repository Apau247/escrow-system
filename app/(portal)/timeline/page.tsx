"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useAction, usePortal } from "@/lib/client";
import { Badge, Banner, Card, EmptyState, ErrorState, Loading, StatusPill } from "@/components/ui";

export default function TimelinePage() {
  const { data, error, loading, refresh } = usePortal();
  const { run, busy, feedback } = useAction(refresh);
  const [note, setNote] = useState("");

  if (loading) return <Loading label="Loading release timeline..." />;
  if (error || !data) return <ErrorState message={error ?? "No data returned."} onRetry={() => void refresh()} />;

  const eventsByStage: Record<string, any[]> = {};
  for (const ev of data.stageEvents) {
    (eventsByStage[ev.stage_key] ??= []).push(ev);
  }

  async function complete(key: string) {
    const ok = await run("/api/actions/stage", { key, note: note || undefined });
    if (ok) setNote("");
  }

  const actionable = data.stages.find((s) => s.status === "IN_PROGRESS" && !s.auto);

  return (
    <div className="space-y-6">
      <Banner tone="blue" title="Release-condition workflow">
        Stages advance strictly in order. Each completion records the responsible department, timestamp, actor and
        authorization history. Disbursement authorization requires TWO distinct authorized officers (Finance Officer +
        Escrow Agent), and every mutation is written to the immutable audit chain.
      </Banner>

      {feedback && (
        <Banner
          tone={feedback.tone === "success" ? "green" : "red"}
          title={feedback.tone === "success" ? "Workflow updated" : "Action blocked"}
          live={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.text}
        </Banner>
      )}

      {actionable && (
        <Card title={`Action required - Stage ${actionable.seq}: ${actionable.name}`} subtitle={`Responsible department: ${actionable.department}`}>
          <label htmlFor="stage-note" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Authorization note (optional)
          </label>
          <input
            id="stage-note"
            className="input"
            placeholder="Optional note recorded with the authorization..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
          <button type="button" className="btn-primary mt-3" disabled={busy} aria-busy={busy} onClick={() => void complete(actionable.key)}>
            {busy ? "Recording..." : "Complete this stage"}
          </button>
        </Card>
      )}

      {data.stages.length === 0 ? (
        <EmptyState title="No workflow stages configured" />
      ) : (
        <ol className="relative space-y-4 border-l-2 border-white/10 pl-6">
          {data.stages.map((s) => {
            const events = eventsByStage[s.key] ?? [];
            return (
              <li key={s.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                    s.status === "COMPLETED"
                      ? "border-emerald-400 bg-emerald-400/20 text-emerald-300"
                      : s.status === "IN_PROGRESS"
                        ? "animate-pulse border-amber-400 bg-amber-400/20 text-amber-300"
                        : "border-slate-600 bg-navy-900 text-slate-400"
                  }`}
                >
                  {s.status === "COMPLETED" ? <Check className="h-3 w-3" strokeWidth={3.5} /> : s.seq}
                </span>
                <div className={`card p-4 ${s.status === "IN_PROGRESS" ? "ring-1 ring-amber-400/40" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-white">
                      {s.seq}. {s.name}{" "}
                      {s.auto === 1 && <Badge tone="blue">SYSTEM-EVALUATED</Badge>}
                    </p>
                    <StatusPill status={s.status} />
                  </div>
                  <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-slate-400 sm:grid-cols-3">
                    <p><span className="uppercase tracking-wider">Department:</span> {s.department}</p>
                    <p><span className="uppercase tracking-wider">Completed:</span> {s.completed_at ? new Date(s.completed_at).toLocaleString() : "-"}</p>
                    <p><span className="uppercase tracking-wider">Authorized by:</span> {s.completed_by ?? "-"}</p>
                  </div>
                  {s.notes && <p className="mt-2 text-[13px] text-slate-300">{s.notes}</p>}
                  {events.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-sky-300 hover:text-sky-200">
                        Authorization history ({events.length})
                      </summary>
                      <ul className="mt-2 space-y-1.5 border-l border-white/10 pl-3 text-xs text-slate-400">
                        {events.map((ev) => (
                          <li key={ev.id}>
                            <span className="mono text-slate-300">{new Date(ev.created_at).toLocaleString()}</span>{" "}
                            - {ev.action} · {ev.actor_name ?? "SYSTEM"} ({ev.actor_role}){ev.note ? ` · ${ev.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {data.dualApprovals.length > 0 && (
        <Card title="Disbursement dual-authorization record">
          <ul className="space-y-1.5 text-sm text-slate-200">
            {data.dualApprovals.map((a: any) => (
              <li key={a.id}>
                <Check aria-hidden="true" className="mr-1 inline h-4 w-4 text-emerald-400" />
                {a.approver_name} - <span className="badge bg-white/10">{a.approver_role.replaceAll("_", " ")}</span>{" "}
                <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
