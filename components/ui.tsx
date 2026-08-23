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
    ISSUED: "green",
    POSTED: "green",
    IN_PROGRESS: "amber",
    UPLOADED: "blue",
    PENDING: "slate",
    PENDING_VERIFICATION: "amber",
    COMPLIANCE_REVIEWED: "blue",
    AGENT_APPROVED: "blue",
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
      <p className={`mono mt-1.5 text-lg font-bold ${color}`}>{formatMoney(cents)}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Banner({
  tone = "amber",
  title,
  children,
  live,
}: {
  tone?: "amber" | "red" | "blue" | "green";
  title: React.ReactNode;
  children?: React.ReactNode;
  /** Renders as an ARIA live region for async action feedback. */
  live?: "status" | "alert";
}) {
  const styles = {
    amber: "border-amber-500/40 bg-amber-500/10",
    red: "border-red-500/40 bg-red-500/10",
    blue: "border-sky-500/40 bg-sky-500/10",
    green: "border-emerald-500/40 bg-emerald-500/10",
  } as const;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`} role={live} aria-live={live ? "polite" : undefined}>
      <p className="font-bold">{title}</p>
      {children && <div className="mt-1 text-[13px] leading-relaxed text-slate-300">{children}</div>}
    </div>
  );
}

export function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-sm text-slate-100 ${mono ? "mono" : ""}`}>{value}</dd>
    </div>
  );
}

/** Consistent async-loading state. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-8 text-sm text-slate-400">
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" />
      {label}
    </div>
  );
}

/** Consistent error state with optional retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-4">
      <p className="text-sm font-bold text-red-300">Something went wrong</p>
      <p className="mt-1 text-[13px] text-slate-300">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-3">
          Try again
        </button>
      )}
    </div>
  );
}

/** Consistent empty state. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-black/10 px-4 py-10 text-center">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
