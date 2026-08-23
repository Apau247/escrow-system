"use client";

import { formatMoney } from "@/lib/money";

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={className}>{formatMoney(cents)}</span>;
}

const TONES: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  red: "bg-red-500/15 text-red-300 border border-red-500/30",
  blue: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  slate: "bg-white/10 text-slate-300 border border-white/15",
  gold: "bg-gold-400/15 text-gold-400 border border-gold-400/40",
};

export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES | string; children: React.ReactNode }) {
  return <span className={`badge ${TONES[tone] ?? TONES.slate}`}>{children}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: "green",
    VERIFIED: "green",
    VERIFIED_UPLOADED: "blue",
    ISSUED: "green",
    IN_PROGRESS: "amber",
    UPLOADED: "blue",
    PENDING: "slate",
    PENDING_VERIFICATION: "amber",
    MISSING: "red",
    REJECTED: "red",
    RESTRICTED: "red",
  };
  return <Badge tone={map[status] ?? "slate"}>{status.replaceAll("_", " ")}</Badge>;
}

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card card-pad ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-bold text-white">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {right && <div>{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  cents,
  hint,
  tone = "default",
}: {
  label: string;
  cents: number;
  hint?: string;
  tone?: "default" | "gold" | "danger" | "success";
}) {
  const color =
    tone === "gold" ? "text-gold-400" : tone === "danger" ? "text-red-300" : tone === "success" ? "text-emerald-300" : "text-white";
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1.5 mono text-lg font-bold ${color}`}>{formatMoney(cents)}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Banner({
  tone = "amber",
  title,
  children,
}: {
  tone?: "amber" | "red" | "blue";
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  const styles = {
    amber: "border-amber-500/40 bg-amber-500/10",
    red: "border-red-500/40 bg-red-500/10",
    blue: "border-sky-500/40 bg-sky-500/10",
  } as const;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}>
      <p className="font-bold">{title}</p>
      {children && <div className="mt-1 text-[13px] leading-relaxed text-slate-300">{children}</div>}
    </div>
  );
}

export function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm text-slate-100 ${mono ? "mono" : ""}`}>{value}</dd>
    </div>
  );
}
