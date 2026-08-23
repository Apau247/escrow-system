import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (session) {
    appendAudit(getDb(), { actor: session, action: "LOGOUT", entityType: "USER", entityId: session.userId });
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
