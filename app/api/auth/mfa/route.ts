import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decryptField } from "@/lib/field-crypto";
import { verifyTotp } from "@/lib/totp";
import {
  getUserById,
  issueSessionToken,
  setSessionCookie,
  verifyMfaChallengeToken,
  type Role,
} from "@/lib/auth";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json().catch(() => null);
  const userId = verifyMfaChallengeToken(String(body?.challenge ?? ""));
  const code = String(body?.code ?? "");
  if (!userId) {
    return NextResponse.json({ error: "MFA challenge expired. Sign in again." }, { status: 401 });
  }
  const user = getUserById(db, userId);
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 401 });

  const secret = decryptField(user.mfa_secret_enc);
  if (!verifyTotp(secret, code)) {
    appendAudit(db, {
      actor: null,
      action: "LOGIN_MFA_FAILED",
      entityType: "USER",
      entityId: user.id,
      details: {},
    });
    return NextResponse.json({ error: "Invalid MFA code." }, { status: 401 });
  }

  const sessionUser: SessionPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  };
  await setSessionCookie(issueSessionToken(sessionUser));
  appendAudit(db, {
    actor: sessionUser,
    action: "LOGIN_SUCCESS",
    entityType: "USER",
    entityId: user.id,
    details: { mfa: true },
  });
  return NextResponse.json({ ok: true });
}

interface SessionPayload {
  userId: number;
  email: string;
  name: string;
  role: Role;
}
