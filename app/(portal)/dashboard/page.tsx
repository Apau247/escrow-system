"use client";

import Link from "next/link";
import { usePortal } from "@/lib/client";
import { Badge, Banner, Card, Money, Stat, StatusPill } from "@/components/ui";

export default function DashboardPage() {
  const { data, error, loading } = usePortal();

  if (loading) return <p className="text-sm text-slate-400">Loading escrow position…</p>;
  if (error || !data) return <Banner tone="red" title="Failed to load">{error}</Banner>;

  const { escrow: e, balances: b, stages, obligations, chain } = data;
  const nextStage = stages.find((s) => s.status !== "COMPLETED");

  return (
    <div className="space-y-6">
      <Card
        title={
          <span className="flex flex-wrap items-center gap-3">
            Escrow Account {e.reference}
            <Badge tone="red">{e.status_code} — PENDING ESCROW RELEASE CONDITIONS</Badge>
          </span>
        }
        subtitle={`${e.depositor_name} · ${e.nationality} · Deposit date ${e.deposit_date}`}
        right={<Badge tone="amber">TEST RECORD — UNVERIFIED</Badge>}
      >
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs uppercase text-slate-500">Depositor</dt><dd className="mt-0.5 text-sm font-semibold text-white">{e.depositor_name}</dd></div>
          <div><dt className="text-xs uppercase text-slate-500">Next of Kin</dt><dd className="mt-0.5 text-sm text-slate-200">{e.next_of_kin}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs uppercase text-slate-500">Residential Address</dt><dd className="mt-0.5 text-sm text-slate-200">{e.address}</dd></div>
          <div><dt className="text-xs uppercase text-slate-500">Custodial Status</dt><dd className="mt-0.5 text-sm text-slate-200">{e.custodial_status}</dd></div>
          <div><dt className="text-xs uppercase text-slate-500">Physical Asset</dt><dd className="mt-0.5 text-sm text-slate-200">{e.asset_description}</dd></div>
          <div><dt className="text-xs uppercase text-slate-500">Vault Reference</dt><dd className="mono mt-0.5 text-sm text-slate-200">{e.vault_reference}</dd></div>
          <div><dt className="text-xs uppercase text-slate-500">Certificate</dt><dd className="mono mt-0.5 text-sm text-slate-200">{data.certificate?.reference ?? "—"}</dd></div>
        </dl>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Total Escrow Balance" cents={b.total_balance_cents} tone="gold" hint={b.currency_code + " · deposit principal"} />
        <Stat label="Restricted Escrow Funds" cents={b.restricted_cents} tone="danger" hint="Locked pending release conditions" />
        <Stat label="Funds Pending Release" cents={b.pending_release_cents} hint="Authorized via dual approval, not yet released" />
        <Stat label="Released Funds" cents={b.released_cents} tone="success" />
        <Stat label="Escrow Charges" cents={b.charges_cents} hint="Posted verified obligations only" />
        <Stat label="Final Disbursement Amount" cents={b.final_disbursement_cents} tone="gold" hint="Total − charges − held − released" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Release Tax / Tax Obligation"
          subtitle="Escrow Release Tax & Obligations"
          right={<Link href="/obligations" className="btn-secondary !py-1.5 !text-xs">Manage →</Link>}
        >
          {obligations.map((o) => (
            <div key={o.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-white">{o.label}</p>
                <StatusPill status={o.status} />
              </div>
              <p className="mono mt-2 text-xl font-bold text-gold-400">
                <Money cents={o.amount_cents} />
              </p>
              <p className="mt-1 text-xs text-slate-400">{o.purpose}</p>
            </div>
          ))}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            This figure is a test record. It is NOT an assessed tax liability and there is no payment-to-release
            mechanism; funds move only through the verified institutional workflow.
          </p>
        </Card>

        <Card
          title="Escrow Release Status & Timeline"
          subtitle={`Current stage: ${nextStage?.name ?? "All stages complete"}`}
          right={<Link href="/timeline" className="btn-secondary !py-1.5 !text-xs">Full timeline →</Link>}
        >
          <ol className="space-y-2.5">
            {stages.slice(Math.max(0, (nextStage?.seq ?? 13) - 3), Math.min(stages.length, (nextStage?.seq ?? 13) + 1)).map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${s.status === "COMPLETED" ? "bg-emerald-400" : s.status === "IN_PROGRESS" ? "bg-amber-400 animate-pulse" : "bg-slate-600"}`} />
                <span className="flex-1 text-sm text-slate-200">
                  {s.seq}. {s.name}
                </span>
                <StatusPill status={s.status} />
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
            Audit hash-chain integrity:{" "}
            {chain.valid ? (
              <span className="font-semibold text-emerald-300">VERIFIED ({chain.entriesChecked} entries)</span>
            ) : (
              <span className="font-semibold text-red-300">TAMPER DETECTED at seq {chain.firstBrokenAtSeq}</span>
            )}
          </div>
        </Card>
      </div>

      <Card title="Security Posture" subtitle="Controls enforced by this platform">
        <div className="grid gap-2 text-[13px] text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Multi-factor authentication (TOTP)",
            "Role-based access control",
            "Dual authorization for disbursements",
            "Immutable hash-chained audit log",
            "AES-256-GCM field encryption",
            "Signed HTTP-only session cookies",
            "Sequential release-condition workflow",
            "Document verification gates",
            "Fraud burst monitoring",
            "No silent balance/status mutation",
          ].map((item) => (
            <p key={item} className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span> {item}
            </p>
          ))}
        </div>
      </Card>
    </div>
  );
}
