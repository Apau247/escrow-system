import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/api-guard";
import { ROLE_LABELS, actionsFor } from "@/lib/rbac";
import type { Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireSession(["ADMIN"]);
  if ("error" in guard) return guard.error;
  const db = getDb();
  const users = db
    .prepare("SELECT id, name, email, role, mfa_enabled, active, created_at FROM users ORDER BY id ASC")
    .all() as Array<{ id: number; name: string; email: string; role: Role; mfa_enabled: number; active: number; created_at: string }>;
  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      role_label: ROLE_LABELS[u.role],
      permissions: actionsFor(u.role),
    })),
  });
}
