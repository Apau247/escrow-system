"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui";

export default function UsersPage() {
  const [data, setData] = useState<{ users: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <Card title="User management & role-based access control" subtitle="Administrator view — permissions derive from the central RBAC matrix">
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>MFA</th>
              <th>Status</th>
              <th>Granted permissions</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id}>
                <td>
                  <p className="font-semibold text-white">{u.name}</p>
                  <p className="mono text-xs text-slate-400">{u.email}</p>
                </td>
                <td><Badge tone="blue">{u.role_label}</Badge></td>
                <td>{u.mfa_enabled ? <Badge tone="green">Enforced</Badge> : <Badge tone="red">Disabled</Badge>}</td>
                <td>{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>}</td>
                <td>
                  <div className="flex max-w-xl flex-wrap gap-1">
                    {u.permissions.map((p: string) => (
                      <span key={p} className="badge bg-white/5 text-[10px] font-normal text-slate-300">{p}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
