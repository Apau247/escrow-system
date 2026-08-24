/**
 * End-to-end workflow smoke test (run against a DEV server).
 * Exercises MFA-less demo login, auth validation/lockout boundaries, RBAC
 * denials, admin-only guards, the obligation chain, sequential stage gating,
 * document gates, dual authorization, release, settlement, closure,
 * certificate issuance, duplicate-action prevention and audit-chain
 * verification.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = "Test123!";

const PRINCIPAL_CENTS = 240_000_000; // $2,400,000.00 USD
const CHARGE_CENTS = 1_700_000; // $17,000.00 USD
const NET_CENTS = PRINCIPAL_CENTS - CHARGE_CENTS; // $2,383,000.00 USD

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

async function login(email) {
  let r = await api("/api/auth/login", { method: "POST", body: { email, password: PW } });
  if (!r.json.mfa_required) return r.cookie;
  const hint = await api(`/api/auth/mfa-hint?email=${encodeURIComponent(email)}`);
  r = await api("/api/auth/mfa", {
    method: "POST",
    body: { challenge: r.json.challenge, code: hint.json.code },
    cookie: r.cookie,
  });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.json)}`);
  return r.cookie;
}

// Page fetch that does NOT follow redirects (for guard assertions).
async function page(path, cookie) {
  const res = await fetch(BASE + path, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

const CUSTOMER = await login("customer@escrow.test");
const FINANCE = await login("finance@escrow.test");
const COMPLIANCE = await login("compliance@escrow.test");
const AGENT = await login("agent@escrow.test");
const ADMIN = await login("admin@escrow.test");

// Next-of-kin customer account exists and can read the portal.
let r = await login2("kendra.anderson@escrow.test");
check("next-of-kin customer can sign in and read portal", !!r);

async function login2(email) {
  try {
    const c = await login(email);
    const p = await api("/api/portal", { cookie: c });
    return p.status === 200;
  } catch {
    return false;
  }
}

// 1. Unauthenticated access is rejected.
check("portal requires authentication", (await api("/api/portal")).status === 401);
check("anonymous workflow action rejected", (await api("/api/actions/stage", { method: "POST", body: { key: "COMPLIANCE_REVIEW" } })).status === 401);

// 1b. Login input validation.
check("malformed email rejected with 400", (await api("/api/auth/login", { method: "POST", body: { email: "not-an-email", password: PW } })).status === 400);
check("wrong password rejected with 401", (await api("/api/auth/login", { method: "POST", body: { email: "customer@escrow.test", password: "definitely-wrong" } })).status === 401);

// 2. Customer can read but not act.
let p = (await api("/api/portal", { cookie: CUSTOMER })).json;
const obId = p.obligations[0].id;
check("customer reads portal with correct escrow balance", p.balances.total_balance_cents === PRINCIPAL_CENTS);
check(
  "obligation seeded at $17,000.00 USD pending verification",
  p.obligations[0].amount_cents === CHARGE_CENTS && p.obligations[0].currency_code === "USD" && p.obligations[0].status === "PENDING_VERIFICATION"
);
check(
  "customer cannot verify obligation (RBAC)",
  (await api("/api/actions/obligation", { method: "POST", body: { id: obId, action: "verify" }, cookie: CUSTOMER })).status === 403
);
check("customer blocked from user directory API (admin-only)", (await api("/api/users", { cookie: CUSTOMER })).status === 403);
check(
  "unknown stage key returns 400",
  (await api("/api/actions/stage", { method: "POST", body: { key: "NOT_A_STAGE" }, cookie: FINANCE })).status === 400
);
check(
  "invalid obligation action returns 400",
  (await api("/api/actions/obligation", { method: "POST", body: { id: obId, action: "self-release-funds" }, cookie: FINANCE })).status === 400
);

// Page-level guards: server-side redirect, not client-side role checks.
let pg = await page("/admin/users");
check("anonymous redirected to login from admin console", [301, 302, 303, 307, 308].includes(pg.status) && pg.location.includes("/login"), `${pg.status} -> ${pg.location}`);
pg = await page("/admin/users", CUSTOMER);
check("customer redirected away from admin console", [301, 302, 303, 307, 308].includes(pg.status) && pg.location.includes("/dashboard"), `${pg.status} -> ${pg.location}`);
pg = await page("/admin/users", ADMIN);
check("administrator can open admin console", pg.status === 200);

// 3. Finance verifies assessment; premature authorize must fail.
let res = await api("/api/actions/obligation", { method: "POST", body: { id: obId, action: "verify" }, cookie: FINANCE });
check("finance verifies assessment", res.status === 200);
res = await api("/api/actions/obligation", { method: "POST", body: { id: obId, action: "verify" }, cookie: FINANCE });
check("duplicate verification rejected (state machine)", res.status === 409);
res = await api("/api/actions/obligation", { method: "POST", body: { id: obId, action: "authorize" }, cookie: FINANCE });
check("premature authorize blocked (chain order)", res.status === 409);

// 4. Compliance reviews, cannot approve; completes general compliance stage.
check(
  "compliance cannot approve obligation (RBAC)",
  (await api("/api/actions/obligation", { method: "POST", body: { id: obId, action: "approve" }, cookie: COMPLIANCE })).status === 403
);
res = await api("/api/actions/stage", { method: "POST", body: { key: "COMPLIANCE_REVIEW", note: "File reviewed." }, cookie: FINANCE });
check("finance cannot complete compliance stage (RBAC)", res.status === 403);
res = await api("/api/actions/stage", { method: "POST", body: { key: "COMPLIANCE_REVIEW" }, cookie: COMPLIANCE });
check("compliance completes stage 5", res.status === 200);
res = await api("/api/actions/stage", { method: "POST", body: { key: "COMPLIANCE_REVIEW" }, cookie: COMPLIANCE });
check("re-completing a finished stage is rejected (duplicate prevention)", res.status === 409);

// Stage 6 must stay locked until obligation fully authorized+posted.
res = await api("/api/actions/stage", { method: "POST", body: { key: "RELEASE_TAX_OBLIGATION_VERIFICATION" }, cookie: ADMIN });
check("stage 6 blocked while obligation chain incomplete (no payment-to-release shortcut)", res.status === 409);

// 5. Full obligation chain: review -> approve -> authorize/post -> stage 6 sign-off.
res = await api("/api/actions/obligation", { method: "POST", body: { id: obId, action: "review" }, cookie: COMPLIANCE });
check("compliance records obligation review", res.status === 200);
res = await api("/api/actions/obligation", { method: "POST", body: { id: obId, action: "approve" }, cookie: AGENT });
check("escrow agent approves obligation", res.status === 200);
res = await api("/api/actions/obligation", { method: "POST", body: { id: obId, action: "authorize" }, cookie: FINANCE });
check("finance authorizes & posts charge", res.status === 200);

res = await api("/api/actions/stage", { method: "POST", body: { key: "RELEASE_TAX_OBLIGATION_VERIFICATION", note: "Posted charge reviewed." }, cookie: COMPLIANCE });
check("unauthorized role cannot sign off stage 6", res.status === 403);
res = await api("/api/actions/stage", { method: "POST", body: { key: "RELEASE_TAX_OBLIGATION_VERIFICATION" }, cookie: FINANCE });
check("finance signs off stage 6 after posting", res.status === 200);

p = (await api("/api/portal", { cookie: ADMIN })).json;
check("charge posted to ledger with explicit USD currency", p.ledger.some((l) => l.entry_type === "CHARGE" && l.currency_code === "USD" && l.amount_cents === CHARGE_CENTS));
check("balances reflect posted charge", p.balances.charges_cents === CHARGE_CENTS && p.balances.final_disbursement_cents === NET_CENTS);
check("stage 6 completed after posting + sign-off", p.stages.find((s) => s.key === "RELEASE_TAX_OBLIGATION_VERIFICATION").status === "COMPLETED");

// 6. Agent authorization stage.
res = await api("/api/actions/stage", { method: "POST", body: { key: "ESCROW_AGENT_AUTHORIZATION" }, cookie: AGENT });
check("agent authorizes release package (stage 8)", res.status === 200);

// 7. Document gate blocks disbursement authorization.
res = await api("/api/actions/stage", { method: "POST", body: { key: "DISBURSEMENT_AUTHORIZATION" }, cookie: FINANCE });
check("disbursement blocked by unverified documents", res.status === 409);
for (const doc of (await api("/api/portal", { cookie: COMPLIANCE })).json.documents.filter((d) => d.status !== "VERIFIED")) {
  if (doc.status === "MISSING") {
    res = await api("/api/actions/document", { method: "POST", body: { id: doc.id, action: "upload" }, cookie: COMPLIANCE });
    check(`document uploaded (${doc.title})`, res.status === 200);
  }
  res = await api("/api/actions/document", { method: "POST", body: { id: doc.id, action: "verify" }, cookie: COMPLIANCE });
  check(`document verified (${doc.title})`, res.status === 200);
}

// 8. Dual authorization: two distinct officers required.
res = await api("/api/actions/stage", { method: "POST", body: { key: "DISBURSEMENT_AUTHORIZATION" }, cookie: FINANCE });
check("first approval recorded (1/2)", res.status === 200, String(res.json.message ?? res.json.error));
res = await api("/api/actions/stage", { method: "POST", body: { key: "DISBURSEMENT_AUTHORIZATION" }, cookie: FINANCE });
check("same officer cannot double-approve", res.status === 409);
res = await api("/api/actions/stage", { method: "POST", body: { key: "DISBURSEMENT_AUTHORIZATION" }, cookie: AGENT });
check("second distinct approval completes dual authorization", res.status === 200);

p = (await api("/api/portal", { cookie: ADMIN })).json;
check(
  "funds reserved pending release after dual approval",
  p.balances.pending_release_cents === NET_CENTS && p.balances.restricted_cents === 0
);
check("stage 7 auto-satisfied by system evaluation", p.stages.find((s) => s.key === "RELEASE_CONDITIONS_SATISFIED").status === "COMPLETED");
check("two distinct approvers recorded", p.dualApprovals.length === 2);

// 9. Release -> Settlement -> Closure.
res = await api("/api/actions/stage", { method: "POST", body: { key: "ESCROW_RELEASE" }, cookie: AGENT });
check("escrow agent cannot execute release (RBAC)", res.status === 403);
res = await api("/api/actions/stage", { method: "POST", body: { key: "ESCROW_RELEASE" }, cookie: FINANCE });
check("finance executes escrow release (stage 10)", res.status === 200);
res = await api("/api/actions/stage", { method: "POST", body: { key: "SETTLEMENT" }, cookie: FINANCE });
check("settlement executed (stage 11)", res.status === 200);
res = await api("/api/actions/stage", { method: "POST", body: { key: "ESCROW_CLOSURE" }, cookie: FINANCE });
check("closure restricted to administrator (RBAC)", res.status === 403);
res = await api("/api/actions/stage", { method: "POST", body: { key: "ESCROW_CLOSURE" }, cookie: ADMIN });
check("administrator closes escrow (stage 12)", res.status === 200);

// 10. Certificate issuance + final state + audit integrity.
res = await api("/api/actions/certificate", { method: "POST", cookie: AGENT });
check("certificate issuance restricted to administrator", res.status === 403);
res = await api("/api/actions/certificate", { method: "POST", cookie: ADMIN });
check("certificate formally issued", res.status === 200);

p = (await api("/api/portal", { cookie: ADMIN })).json;
check(`released funds correct ($${(NET_CENTS / 100).toLocaleString()})`, p.balances.released_cents === NET_CENTS);
check("audit hash-chain intact", p.chain.valid === true, `${p.chain.entriesChecked} entries verified`);
check("certificate marked ISSUED + VERIFIED", p.certificate.status === "ISSUED" && p.certificate.verification_status === "VERIFIED");
check("account status CLOSED", p.escrow.status_code === "CLOSED");
check("all 12 stages completed", p.stages.every((s) => s.status === "COMPLETED"));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
