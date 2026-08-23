"use client";

import { useState } from "react";
import { postAction, useMe, usePortal } from "@/lib/client";
import { Badge, Banner, Card, Field } from "@/components/ui";

export default function CertificatePage() {
  const { data, refresh } = usePortal();
  const me = useMe();
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  const cert = data.certificate;
  if (!cert) return <Banner tone="red" title="No certificate on file" />;

  async function issue() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await postAction("/api/actions/certificate");
      setMsg({ tone: "green", text: res.message });
      await refresh();
    } catch (e: any) {
      setMsg({ tone: "red", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const isTest = cert.status === "TEST_DEVELOPMENT_RECORD";
  const p = cert.payload;

  return (
    <div className="space-y-6">
      {msg && <Banner tone={msg.tone === "green" ? "blue" : "red"} title="Certificate action">{msg.text}</Banner>}

      <div className={`card relative overflow-hidden p-1 ${isTest ? "ring-2 ring-amber-500/60" : "ring-2 ring-emerald-500/50"}`}>
        <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center">
          <span className={`rotate-[-4deg] rounded-md border-2 px-8 py-2 text-xl font-black uppercase tracking-[0.25em] ${isTest ? "border-amber-400/70 text-amber-400/90" : "border-emerald-400/70 text-emerald-300/90"} bg-black/40`}>
            {isTest ? "Test / Development Record" : "Formally Issued"}
          </span>
        </div>
        <div className="border-[6px] border-double border-gold-500/40 bg-gradient-to-br from-navy-900 via-navy-950 to-black p-8 pt-24">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-gold-400">Escrow Certificate</p>
            <h1 className="mono mt-3 text-lg font-bold text-white sm:text-xl">{cert.reference}</h1>
          </div>

          <dl className="mx-auto mt-8 grid max-w-3xl gap-x-10 gap-y-5 sm:grid-cols-2">
            <Field label="Depositor" value={`${p.depositor} (${p.nationality})`} />
            <Field label="Escrow Account" value={p.escrow_account} mono />
            <Field label="Deposit Date" value={p.deposit_date} mono />
            <Field label="Escrow Deposit" value={p.escrow_deposit} mono />
            <Field label="Physical Asset" value={p.physical_asset} />
            <Field label="Vault Reference" value={p.vault_reference} mono />
            <Field label="Custody Status" value={p.custody_status} />
            <Field label="Next of Kin" value={p.next_of_kin} />
            <Field label="Escrow Agent" value={cert.agent_name} />
            <Field label="Issued On" value={cert.issued_on} mono />
          </dl>

          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-6">
            <Badge tone={isTest ? "amber" : "green"}>Certificate status: {cert.status.replaceAll("_", " ")}</Badge>
            <Badge tone={cert.verification_status === "VERIFIED" ? "green" : "slate"}>
              Verification: {cert.verification_status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Document history" subtitle="Append-only certificate event log">
          <ol className="space-y-3 border-l border-white/10 pl-4">
            {cert.document_history.map((h: any, i: number) => (
              <li key={i} className="text-sm">
                <p className="font-semibold text-slate-100">{h.event.replaceAll("_", " ")}</p>
                <p className="text-xs text-slate-400">
                  <span className="mono">{new Date(h.at).toLocaleString()}</span> · {h.by}
                </p>
                <p className="text-xs text-slate-400">{h.note}</p>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Formal issuance" subtitle="Institution-controlled verification step">
          {isTest ? (
            <>
              <p className="text-[13px] leading-relaxed text-slate-300">
                This certificate is a draft and must remain marked <strong>TEST/DEVELOPMENT RECORD</strong> until it is
                verified and formally issued by the institution. Issuance requires every custody/release document to be
                VERIFIED, and the action is restricted to an Administrator with full audit logging.
              </p>
              {me?.role === "ADMIN" && (
                <button className="btn-primary mt-4" disabled={busy} onClick={issue}>
                  {busy ? "Processing…" : "Verify & formally issue certificate"}
                </button>
              )}
              {me && me.role !== "ADMIN" && (
                <Banner tone="amber" title="Administrator permission required">
                  Only an Administrator can formally issue this certificate.
                </Banner>
              )}
              {!me && <p className="mt-3 text-xs text-slate-500">Loading role…</p>}
            </>
          ) : (
            <Banner tone="blue" title="Certificate has been formally issued">
              Issuance events are recorded in the document history and in the immutable audit chain.
            </Banner>
          )}
        </Card>
      </div>
    </div>
  );
}
