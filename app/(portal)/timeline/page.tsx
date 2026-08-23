"use client";

import { useState } from "react";
import { postAction, usePortal } from "@/lib/client";
import { Badge, Banner, Card, StatusPill } from "@/components/ui";

export default function TimelinePage() {
  const { data, refresh } = usePortal();
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  const eventsByStage: Record<string, any[]> = {};
  for (const ev of data.stageEvents) {
    (eventsByStage[ev.stage_key] ??= []).push(ev);
  }

  async function complete(key: string) {
    setBusyKey(key);
    setMsg(null);
    try {
      const res = await postAction("/api/actions/stage", { key, note: note || undefined });
      setMsg({ tone: "green", text: res.message });
      setNote("");
      await refresh();
    } catch (e: any) {
      setMsg({ tone: "red", text: e.message });
    } finally {
      setBusyKey(null);
    }
  }

  const actionable = data.stages.find((s) => s.status === "IN_PROGRESS" && !s.auto);

  return (
    <div className="space-y-6">
      <Banner tone="blue" title="Release-condition workflow">
        Stages advance strictly in order. Each completion records the responsible department, timestamp, actor and
        authorization history. Disbursement authorization requires TWO distinct authorized officers (Finance Officer +
        Escrow Agent), and every mutation is written to the immutable audit chain.
      </Banner>

      {msg && <Banner tone={msg.tone === "green" ? "blue" : "red"} title={msg.tone === "green" ? "Workflow updated" : "Action blocked"}>{msg.text}</Banner>}

      {actionable && (
        <Card title={`Action required — Stage ${actionable.seq}: ${actionable.name}`} subtitle={`Responsible department: ${actionable.department}`}>
          <input
            className="input"
            placeholder="Optional note recorded with the authorization…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
          <button className="btn-primary mt-3" disabled={busyKey !== null} onClick={() => complete(actionable.key)}>
            {busyKey ? "Recording…" : "Complete this stage"}
          </button>
        </Card>
      )}

      <ol className="relative space-y-4 border-l-2 border-white/10 pl-6">
        {data.stages.map((s) => {
          const events = eventsByStage[s.key] ?? [];
          return (
            <li key={s.id} className="relative">
              <span
                className={`absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                  s.status === "COMPLETED"
                    ? "border-emerald-400 bg-emerald-400/20 text-emerald-300"
                    : s.status === "IN_PROGRESS"
                      ? "border-amber-400 bg-amber-400/20 text-amber-300 animate-pulse"
                      : "border-slate-600 bg-navy-900 text-slate-500"
                }`}
              >
                {s.status === "COMPLETED" ? "✓" : s.seq}
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
                  <p><span className="uppercase tracking-wider">Completed:</span> {s.completed_at ? new Date(s.completed_at).toLocaleString() : "—"}</p>
                  <p><span className="uppercase tracking-wider">Authorized by:</span> {s.completed_by ?? "—"}</p>
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
                          — {ev.action} · {ev.actor_name ?? "SYSTEM"} ({ev.actor_role}){ev.note ? ` · ${ev.note}` : ""}
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

      {data.dualApprovals.length > 0 && (
        <Card title="Disbursement dual-authorization record">
          <ul className="space-y-1.5 text-sm text-slate-200">
            {data.dualApprovals.map((a: any) => (
              <li key={a.id}>
                ✓ {a.approver_name} — <span className="badge bg-white/10">{a.approver_role.replaceAll("_", " ")}</span>{" "}
                <span className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
