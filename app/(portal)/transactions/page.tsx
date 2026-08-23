"use client";

import { usePortal } from "@/lib/client";
import { Badge, Card, Money } from "@/components/ui";

const TYPE_TONES: Record<string, string> = {
  DEPOSIT: "green",
  CHARGE: "amber",
  RESERVE: "blue",
  UNRESERVE: "slate",
  RELEASE: "gold",
};

export default function TransactionsPage() {
  const { data } = usePortal();
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <Card title="Ledger" subtitle="Every monetary entry stores its currency explicitly — no currency is assumed from the account. Append-only: corrections are made with new entries, never edits.">
        <div className="overflow-x-auto">
          <table className="table-base">
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
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Total deposits</p><p className="mono mt-1 font-bold text-white"><Money cents={data.balances.total_balance_cents} /></p></div>
        <div className="card p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Charges posted</p><p className="mono mt-1 font-bold text-amber-300"><Money cents={data.balances.charges_cents} /></p></div>
        <div className="card p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Released to date</p><p className="mono mt-1 font-bold text-gold-400"><Money cents={data.balances.released_cents} /></p></div>
      </div>
    </div>
  );
}
