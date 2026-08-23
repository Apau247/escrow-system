"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, EmptyState, ErrorState, Loading } from "@/components/ui";

export default function UsersClient() {
  const [data, setData] = useState<{ users: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/users", { cache: "no-store" });
      const j = await r.json().catch(() => ({}) as any);
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      if (!j || !Array.isArray(j.users)) throw new Error("Server returned an invalid response. Please retry.");
      setData(j);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Loading label="Loading user directory..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data || data.users.length === 0)
    return <EmptyState title="No users found" hint="Platform accounts with assigned roles will appear here." />;

  return (
    <Card title="User management & role-based access control" subtitle="Administrator view - permissions derive from the central RBAC matrix">
      <div className="table-wrap">
        <table className="table-base">
          <caption className="sr-only">Platform users with roles, MFA status and granted permissions</caption>
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
