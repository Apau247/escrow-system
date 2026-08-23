import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { DatabaseSync } from "node:sqlite";
import { readOrCreateHexKey } from "./field-crypto";
import { dataDir } from "./storage";

export type Role =
  | "CUSTOMER"
  | "ESCROW_AGENT"
  | "COMPLIANCE_OFFICER"
  | "FINANCE_OFFICER"
  | "ADMIN";

export interface SessionUser {
  userId: number;
  email: string;
  name: string;
  role: Role;
}

let secretCache: string | null = null;

function jwtSecret(): string {
  if (secretCache) return secretCache;
  // Explicit env override keeps sessions valid across serverless instances.
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret && envSecret.length >= 32) {
    secretCache = envSecret;
    return secretCache;
  }
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  secretCache = readOrCreateHexKey(path.join(dir, "session.secret"), 48);
  return secretCache;
}

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64url");

function sign(data: string): string {
  return crypto.createHmac("sha256", jwtSecret()).update(data).digest("base64url");
}

export function issueSessionToken(user: SessionUser, ttlSeconds = 60 * 60 * 8): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      ...user,
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    })
  );
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export function verifySessionToken(token: string): SessionUser | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: claims.userId, email: claims.email, name: claims.name, role: claims.role };
  } catch {
    return null;
  }
}

/** Short-lived signed token bridging password step -> MFA step of login. */
export function issueMfaChallengeToken(userId: number, ttlSeconds = 300): string {
  const data = JSON.stringify({ kind: "mfa", userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const enc = b64url(data);
  return `${enc}.${sign(enc)}`;
}

export function verifyMfaChallengeToken(token: string): number | null {
  const [enc, signature] = token.split(".");
  if (!enc || !signature) return null;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(enc));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(enc, "base64url").toString("utf8"));
    if (claims.kind !== "mfa" || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims.userId as number;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "escrow_session";

export function getSessionFromCookieHeader(cookieHeader: string | undefined | null): SessionUser | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return verifySessionToken(decodeURIComponent(rest.join("=")));
    }
  }
  return null;
}

/** Helper for route handlers using next/headers cookies(). */
export async function getSession(): Promise<SessionUser | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}

export async function setSessionCookie(token: string): Promise<void> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export function getUserById(db: DatabaseSync, userId: number) {
  return db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(userId) as
    | { id: number; name: string; email: string; role: Role; mfa_secret_enc: string; mfa_enabled: number }
    | undefined;
}
