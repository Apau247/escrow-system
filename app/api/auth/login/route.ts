import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { decryptField } from "@/lib/field-crypto";
import { verifyTotp } from "@/lib/totp";
import { issueMfaChallengeToken, issueSessionToken, setSessionCookie, type Role } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { clearAuthFailures, clientIp, isLockedOut, recordAuthFailure } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** MFA is required unless REQUIRE_MFA=false is set (e.g., for quick demos). */
function mfaEnabled(): boolean {
  return process.env.REQUIRE_MFA !== "false";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const code = body.code === undefined ? undefined : String(body.code);

  // Input validation — fail fast before touching the database.
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 1 || password.length > 1024) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
  if (code !== undefined && !/^\d{6}$/.test(code)) {
    return NextResponse.json({ mfa_required: true, error: "Invalid MFA code format." }, { status: 400 });
  }

  // Lockout check happens before credential verification so a locked bucket
  // cannot be used as a password oracle.
  const lockKey = `${clientIp(req.headers)}|${email}`;
  if (isLockedOut(lockKey)) {
    appendAudit(db, {
      actor: null,
      action: "LOGIN_RATE_LIMITED",
      entityType: "USER",
      entityId: email,
      details: {},
    });
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in 15 minutes." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email) as
    | { id: number; name: string; email: string; role: Role; password_hash: string; mfa_secret_enc: string; mfa_enabled: number }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordAuthFailure(lockKey);
    appendAudit(db, {
      actor: null,
      action: "LOGIN_FAILED",
      entityType: "USER",
      entityId: email,
      details: { reason: "invalid_credentials" },
    });
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  if (!mfaEnabled() || !user.mfa_enabled) {
    clearAuthFailures(lockKey);
    const token = issueSessionToken({ userId: user.id, email: user.email, name: user.name, role: user.role });
    await setSessionCookie(token);
    appendAudit(db, {
      actor: { userId: user.id, email: user.email, name: user.name, role: user.role },
      action: "LOGIN_SUCCESS",
      entityType: "USER",
      entityId: user.id,
      details: { mfa: false },
    });
    return NextResponse.json({ mfa_required: false });
  }

  const secret = decryptField(user.mfa_secret_enc);
  if (code !== undefined) {
    if (!verifyTotp(secret, code)) {
      recordAuthFailure(lockKey);
      appendAudit(db, {
        actor: null,
        action: "LOGIN_MFA_FAILED",
        entityType: "USER",
        entityId: user.id,
        details: {},
      });
      return NextResponse.json({ mfa_required: true, error: "Invalid MFA code." }, { status: 401 });
    }
    clearAuthFailures(lockKey);
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
