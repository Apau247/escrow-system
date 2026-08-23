"use client";

import { usePortal } from "@/lib/client";
import { Badge, Card, EmptyState, ErrorState, Loading, Money } from "@/components/ui";

const TYPE_TONES: Record<string, string> = {
  DEPOSIT: "green",
  CHARGE: "amber",
  RESERVE: "blue",
  UNRESERVE: "slate",
  RELEASE: "gold",
};

export default function TransactionsPage() {
  const { data, error, loading, refresh } = usePortal();

  if (loading) return <Loading label="Loading ledger..." />;
  if (error || !data) return <ErrorState message={error ?? "No data returned."} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-6">
      <Card title="Ledger" subtitle="Every monetary entry stores its currency explicitly - no currency is assumed from the account. Append-only: corrections are made with new entries, never edits.">
        {data.ledger.length === 0 ? (
          <EmptyState title="No ledger entries yet" hint="Deposits, charges and releases will appear here as they are posted." />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <caption className="sr-only">Escrow ledger entries: deposits, charges, reserves and releases</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Currency</th>
                  <th>Memo</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.map((l: any) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-slate-300">{new Date(l.created_at).toLocaleString()}</td>
                    <td><Badge tone={TYPE_TONES[l.entry_type] ?? "slate"}>{l.entry_type}</Badge></td>
                    <td className="mono text-xs text-slate-300">{l.reference}</td>
                    <td className={`mono whitespace-nowrap font-bold ${l.entry_type === "CHARGE" ? "text-amber-300" : l.entry_type === "RELEASE" ? "text-gold-400" : "text-white"}`}>
                      <Money cents={l.amount_cents} />
                    </td>
                    <td className="mono">{l.currency_code}</td>
                    <td className="max-w-sm text-xs text-slate-400">{l.memo}</td>
                    <td className="text-xs text-slate-400">{l.created_by_name ?? "SYSTEM"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Total deposits</p><p className="mono mt-1 font-bold text-white"><Money cents={data.balances.total_balance_cents} /></p></div>
        <div className="card p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Charges posted</p><p className="mono mt-1 font-bold text-amber-300"><Money cents={data.balances.charges_cents} /></p></div>
        <div className="card p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Released to date</p><p className="mono mt-1 font-bold text-gold-400"><Money cents={data.balances.released_cents} /></p></div>
      </div>
    </div>
  );
}
