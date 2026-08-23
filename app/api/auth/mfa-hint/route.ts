import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decryptField } from "@/lib/field-crypto";
import { totpCode } from "@/lib/totp";

export const dynamic = "force-dynamic";

/**
 * DEVELOPMENT-ONLY helper: returns the current TOTP code for a seeded test
 * account so evaluators can complete MFA without an authenticator app.
 * Hard-disabled in production builds.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const email = (req.nextUrl.searchParams.get("email") ?? "").toLowerCase().trim();
  const db = getDb();
  const user = db.prepare("SELECT id, mfa_secret_enc FROM users WHERE email = ? AND active = 1").get(email) as
    | { id: number; mfa_secret_enc: string }
    | undefined;
  if (!user) return NextResponse.json({ error: "Unknown account" }, { status: 404 });

  const secret = decryptField(user.mfa_secret_enc);
  const now = Date.now();
  const step = Math.floor(now / 30_000);
  const msRemaining = 30_000 - (now % 30_000);
  return NextResponse.json({
    code: totpCode(secret, now),
    expires_in_seconds: Math.ceil(msRemaining / 1000),
    warning: "DEVELOPMENT ONLY — MFA helper for seeded test accounts.",
  });
}
