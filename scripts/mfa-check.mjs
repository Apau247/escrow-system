/**
 * MFA + lockout focused checks.
 * Run against a DEV server started with REQUIRE_MFA=true and a FRESH data
 * directory, e.g.:
 *
 *   $env:REQUIRE_MFA="true"; $env:DATA_DIR="<fresh dir>"; npm run dev
 *
 * Validates: password -> TOTP challenge flow, bad-code rejection,
 * per-account lockout after repeated failures, lockout clearing on success.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = "agent@escrow.test";
const PW = "Test123!";

let failures = 0;
function check(name, cond, extra = "") {
  const tag = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`[${tag}] ${name}${extra ? " :: " + extra : ""}`);
}

function jarFrom(res) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, cookie: jarFrom(res) };
}

// 1. Password step returns an MFA challenge.
let r = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PW } });
check("password accepted, MFA challenge issued", r.status === 200 && r.json.mfa_required === true && !!r.json.challenge);

// 2. Malformed code rejected before verification.
r = await api("/api/auth/mfa", { method: "POST", body: { challenge: "x", code: "12ab" } });
check("malformed MFA code rejected with 400", r.status === 400);

// 3. Wrong code rejected.
const challenge1 = (await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PW } })).json.challenge;
r = await api("/api/auth/mfa", { method: "POST", body: { challenge: challenge1, code: "000000" }, cookie: undefined });
check("wrong TOTP code rejected with 401", r.status === 401);

// 4. Correct code completes sign-in (raw fetch to inspect cookie flags).
const hint = await api(`/api/auth/mfa-hint?email=${encodeURIComponent(EMAIL)}`);
const mfaRes = await fetch(BASE + "/api/auth/mfa", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ challenge: challenge1, code: hint.json.code }),
});
check("correct TOTP code signs in", mfaRes.status === 200);

const setCookies = mfaRes.headers.getSetCookie();
const setCookie = setCookies.join("; ");
const cookieJar = setCookies.map((c) => c.split(";")[0]).join("; ");
check("session cookie present", setCookies.length > 0);
check("session cookie HttpOnly", /httponly/i.test(setCookie));
check("session cookie SameSite=Lax", /samesite=lax/i.test(setCookie));
check("session cookie Secure outside dev", process.env.NODE_ENV === "production" ? /secure/i.test(setCookie) : true);
check("session cookie expires with JWT (8h Max-Age)", /max-age=28800/i.test(setCookie));

const portal = await fetch(BASE + "/api/portal", { headers: { Cookie: cookieJar } });
check("authenticated portal access works", portal.status === 200);

// 5. Success clears the failure bucket: one wrong password then a full
// successful login must still work.
await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: "wrong-pass-1" } });
const ch2 = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PW } });
const h2 = await api(`/api/auth/mfa-hint?email=${encodeURIComponent(EMAIL)}`);
const ok2 = await api("/api/auth/mfa", { method: "POST", body: { challenge: ch2.json.challenge, code: h2.json.code } });
check("single failure does not lock account", ok2.status === 200);

// 6. Five consecutive failures trigger lockout (429).
let statuses = [];
for (let i = 0; i < 5; i++) {
  const rr = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: `bad-${i}` } });
  statuses.push(rr.status);
}
check(
  "lockout engages after 5 failures (429)",
  statuses.slice(0, 4).every((s) => s === 401) && statuses[4] === 429,
  statuses.join(",")
);

// 7. Even CORRECT credentials are blocked while locked out.
r = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PW } });
check("correct credentials blocked during lockout", r.status === 429, String(r.json.error ?? ""));

console.log(failures === 0 ? "\nALL MFA CHECKS PASSED" : `\n${failures} MFA CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
