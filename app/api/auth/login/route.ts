import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { decryptField } from "@/lib/field-crypto";
import { verifyTotp } from "@/lib/totp";
import { issueMfaChallengeToken, issueSessionToken, setSessionCookie, type Role } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email) as
    | { id: number; name: string; email: string; role: Role; password_hash: string; mfa_secret_enc: string; mfa_enabled: number }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    appendAudit(db, {
      actor: null,
      action: "LOGIN_FAILED",
      entityType: "USER",
      entityId: email,
      details: { reason: "invalid_credentials" },
    });
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  if (!user.mfa_enabled) {
    const token = issueSessionToken({ userId: user.id, email: user.email, name: user.name, role: user.role });
    await setSessionCookie(token);
    return NextResponse.json({ mfa_required: false });
  }

  const secret = decryptField(user.mfa_secret_enc);
  if (body?.code) {
    if (!verifyTotp(secret, String(body.code))) {
      appendAudit(db, {
        actor: null,
        action: "LOGIN_MFA_FAILED",
        entityType: "USER",
        entityId: user.id,
        details: {},
      });
      return NextResponse.json({ mfa_required: true, error: "Invalid MFA code." }, { status: 401 });
    }
    const token = issueSessionToken({ userId: user.id, email: user.email, name: user.name, role: user.role });
    await setSessionCookie(token);
    appendAudit(db, {
      actor: { userId: user.id, email: user.email, name: user.name, role: user.role },
      action: "LOGIN_SUCCESS",
      entityType: "USER",
      entityId: user.id,
      details: { mfa: true },
    });
    return NextResponse.json({ mfa_required: false });
  }

  return NextResponse.json({
    mfa_required: true,
    challenge: issueMfaChallengeToken(user.id),
  });
}
