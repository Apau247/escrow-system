import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { encryptField } from "./field-crypto";
import { generateTotpSecret } from "./totp";
import { hashPassword } from "./password";
import { appendAudit } from "./audit";
import { dataDir } from "./storage";

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  dbInstance = new DatabaseSync(path.join(dir, "escrow.db"));
  dbInstance.exec("PRAGMA journal_mode = WAL;");
  dbInstance.exec("PRAGMA foreign_keys = ON;");
  migrate(dbInstance);
  seedIfEmpty(dbInstance);
  return dbInstance;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('CUSTOMER','ESCROW_AGENT','COMPLIANCE_OFFICER','FINANCE_OFFICER','ADMIN')),
      profile_title TEXT,
      mfa_secret_enc TEXT NOT NULL,
      mfa_enabled INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS escrow_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      depositor_name TEXT NOT NULL,
      nationality TEXT NOT NULL,
      address TEXT NOT NULL,
      deposit_date TEXT NOT NULL,
      currency_code TEXT NOT NULL CHECK (currency_code IN ('USD')),
      principal_amount_cents INTEGER NOT NULL CHECK (principal_amount_cents > 0),
      asset_description TEXT NOT NULL,
      asset_purity TEXT NOT NULL,
      vault_reference TEXT NOT NULL,
      next_of_kin TEXT NOT NULL,
      custodial_status TEXT NOT NULL,
      status_code TEXT NOT NULL DEFAULT 'RESTRICTED' CHECK (status_code IN ('RESTRICTED','SETTLED','CLOSED')),
      test_record INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS obligations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      escrow_id INTEGER NOT NULL REFERENCES escrow_accounts(id),
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      purpose TEXT NOT NULL,
      currency_code TEXT NOT NULL CHECK (currency_code IN ('USD')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
        CHECK (status IN ('PENDING_VERIFICATION','VERIFIED','COMPLIANCE_REVIEWED','AGENT_APPROVED','POSTED','REJECTED')),
      test_record INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      escrow_id INTEGER NOT NULL REFERENCES escrow_accounts(id),
      seq INTEGER NOT NULL,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      responsible_roles TEXT NOT NULL,
      auto INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('COMPLETED','IN_PROGRESS','PENDING')),
      completed_at TEXT,
      completed_by TEXT,
      notes TEXT,
      UNIQUE (escrow_id, key)
    );

    CREATE TABLE IF NOT EXISTS stage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_id INTEGER NOT NULL REFERENCES timeline_stages(id),
      actor_id INTEGER,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      escrow_id INTEGER NOT NULL REFERENCES escrow_accounts(id),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      reference TEXT,
      status TEXT NOT NULL DEFAULT 'MISSING' CHECK (status IN ('MISSING','UPLOADED','VERIFIED')),
      uploaded_at TEXT,
      verified_at TEXT,
      verified_by INTEGER,
      UNIQUE (escrow_id, category)
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_key TEXT NOT NULL,
      escrow_id INTEGER NOT NULL REFERENCES escrow_accounts(id),
      approver_id INTEGER NOT NULL REFERENCES users(id),
      approver_role TEXT NOT NULL,
      decision TEXT NOT NULL DEFAULT 'APPROVED',
      created_at TEXT NOT NULL,
      UNIQUE (action_key, approver_id)
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      escrow_id INTEGER NOT NULL REFERENCES escrow_accounts(id),
      entry_type TEXT NOT NULL CHECK (entry_type IN ('DEPOSIT','CHARGE','RESERVE','UNRESERVE','RELEASE')),
      reference TEXT NOT NULL,
      currency_code TEXT NOT NULL CHECK (currency_code IN ('USD')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      memo TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      escrow_id INTEGER NOT NULL REFERENCES escrow_accounts(id),
      reference TEXT NOT NULL UNIQUE,
      issued_on TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'TEST_DEVELOPMENT_RECORD'
        CHECK (status IN ('TEST_DEVELOPMENT_RECORD','ISSUED','REVOKED')),
      verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
      agent_name TEXT NOT NULL,
      document_history TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seq INTEGER NOT NULL UNIQUE,
      actor_id INTEGER,
      actor_role TEXT NOT NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      prev_hash TEXT NOT NULL,
      entry_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Incremental migration: profile_title on users (added for next-of-kin display).
  const userCols = (db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((c) => c.name);
  if (!userCols.includes("profile_title")) {
    db.exec("ALTER TABLE users ADD COLUMN profile_title TEXT");
    db.prepare("UPDATE users SET profile_title = 'Escrow Depositor' WHERE email = 'customer@escrow.test'").run();
    db.prepare("UPDATE users SET profile_title = 'Next of Kin' WHERE email = 'kendra.anderson@demo.escrow.test'").run();
  }
}

function seedIfEmpty(db: DatabaseSync) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (row.n > 0) return;

  const now = () => new Date().toISOString();
  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, profile_title, mfa_secret_enc, mfa_enabled, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`
  );
  const people: Array<[string, string, string, string | null]> = [
    ["Tabb Lyle Anderson", "customer@escrow.test", "CUSTOMER", "Escrow Depositor"],
    ["Kendra Anderson", "kendra.anderson@demo.escrow.test", "CUSTOMER", "Next of Kin"],
    ["Margaret Halloway", "agent@escrow.test", "ESCROW_AGENT", null],
    ["Daniel Osei", "compliance@escrow.test", "COMPLIANCE_OFFICER", null],
    ["Priya Nair", "finance@escrow.test", "FINANCE_OFFICER", null],
    ["System Administrator", "admin@escrow.test", "ADMIN", null],
  ];
  for (const [name, email, role, title] of people) {
    insertUser.run(name, email, hashPassword("Test123!"), role, title, encryptField(generateTotpSecret()), now());
  }

  const PRINCIPAL_CENTS = 240_000_000; // $2,400,000.00 USD
  const TAX_TEST_CENTS = 1_700_000; // $17,000.00 USD

  const escrowId = Number(
    db.prepare(
      `INSERT INTO escrow_accounts
       (reference, depositor_name, nationality, address, deposit_date, currency_code,
        principal_amount_cents, asset_description, asset_purity, vault_reference,
        next_of_kin, custodial_status, status_code, test_record, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, 'RESTRICTED', 1, ?, ?)`
    ).run(
      "SCL/223/GB-COD-075095",
      "Tabb Lyle Anderson",
      "United Kingdom",
      "286 Euston Rd, London NW1 3DP, United Kingdom",
      "2015-03-12",
      PRINCIPAL_CENTS,
      "300 kg Alluvial Gold Bars",
      "96.4% minimum",
      "ID SCL/UK/VLT-GD/MFH-300KG",
      "Kendra Anderson",
      "Dormant Custodial Holding - Pending Legal Release",
      "2015-03-12T09:30:00.000Z",
      now()
    ).lastInsertRowid
  );

  db.prepare(
    `INSERT INTO ledger_entries (escrow_id, entry_type, reference, currency_code, amount_cents, memo, created_by, created_at)
     VALUES (?, 'DEPOSIT', ?, 'USD', ?, ?, NULL, ?)`
  ).run(escrowId, "SCL-TXN-2015-000001", PRINCIPAL_CENTS, "Initial escrow deposit recorded [TEST DATA]", "2015-03-12T09:31:00.000Z");

  const stages: Array<[number, string, string, string, number, string, string]> = [
    [1, "ESCROW_DEPOSIT_RECORDED", "Escrow Deposit Recorded", "Escrow Operations", 0, "COMPLETED", "Deposit of $2,400,000.00 USD and physical asset received into custody."],
    [2, "CUSTOMER_VERIFICATION", "Customer Verification", "KYC / Onboarding", 0, "COMPLETED", "Depositor identity and nationality documents verified."],
    [3, "ESCROW_AGREEMENT_VERIFICATION", "Escrow Agreement Verification", "Legal Affairs", 0, "COMPLETED", "Executed escrow agreement on file; terms validated by Legal."],
    [4, "CUSTODY_VERIFICATION", "Custody Verification", "Vault Operations", 0, "COMPLETED", "Physical asset sealed under vault reference ID SCL/UK/VLT-GD/MFH-300KG."],
    [5, "COMPLIANCE_REVIEW", "Compliance Review", "Compliance", 0, "IN_PROGRESS", "Awaiting completion of full compliance file review."],
    [6, "RELEASE_TAX_OBLIGATION_VERIFICATION", "Release Tax/Obligation Verification", "Finance / Tax", 0, "PENDING", "Requires obligation assessment through Verification, Compliance Review, Agent Approval and Posting."],
    [7, "RELEASE_CONDITIONS_SATISFIED", "Release Conditions Satisfied", "System / Compliance", 1, "PENDING", "Automatically satisfied when all preceding conditions are met."],
    [8, "ESCROW_AGENT_AUTHORIZATION", "Escrow Agent Authorization", "Escrow Agency", 0, "PENDING", "Escrow Agent must authorize release package."],
    [9, "DISBURSEMENT_AUTHORIZATION", "Disbursement Authorization", "Finance + Escrow Agency", 0, "PENDING", "Dual authorization required from two distinct authorized officers."],
    [10, "ESCROW_RELEASE", "Escrow Release", "Treasury / Finance", 0, "PENDING", "Funds released only after every prior condition is satisfied."],
    [11, "SETTLEMENT", "Settlement", "Settlements", 0, "PENDING", "Final settlement confirmation with beneficiary bank."],
    [12, "ESCROW_CLOSURE", "Escrow Closure", "Escrow Operations", 0, "PENDING", "Account closure and archival. Restricted to Administrator."],
  ];
  const insertStage = db.prepare(
    `INSERT INTO timeline_stages
     (escrow_id, seq, key, name, department, responsible_roles, auto, status, completed_at, completed_by, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [seq, key, name, dept, auto, status, notes] of stages) {
    const doneAt =
      key === "ESCROW_DEPOSIT_RECORDED" ? "2015-03-12T10:02:00.000Z"
      : key === "CUSTOMER_VERIFICATION" ? "2015-03-18T14:11:00.000Z"
      : key === "ESCROW_AGREEMENT_VERIFICATION" ? "2015-04-02T09:45:00.000Z"
      : key === "CUSTODY_VERIFICATION" ? "2015-04-06T16:20:00.000Z"
      : null;
    insertStage.run(escrowId, seq, key, name, dept, JSON.stringify([]), auto, status, doneAt, doneAt ? "system@escrow.test" : null, notes);
  }

  const docs: Array<[string, string, string | null, string]> = [
    ["ASSET_VERIFICATION", "Independent Asset Verification Report", "DOC-AV-2015-0442", "VERIFIED"],
    ["ASSAY", "Fire Assay Certificate - Alluvial Gold", "DOC-ASY-2015-0198", "UPLOADED"],
    ["SERIALS", "Bar Serial Number Register (300 kg)", "DOC-SRL-2015-0077", "UPLOADED"],
    ["INSURANCE", "Vault Insurance Certificate - All-Risk Cover", "DOC-INS-PENDING", "MISSING"],
    ["VAULT", "Vault Sealing & Custody Record", "DOC-VLT-2015-0311", "UPLOADED"],
    ["OWNERSHIP", "Chain-of-Ownership Documentation", "DOC-OWN-2015-0029", "VERIFIED"],
    ["AGREEMENT", "Executed Escrow Agreement", "DOC-AGR-2015-0007", "VERIFIED"],
    ["CUSTODY", "Custodian Appointment Record", "DOC-CUS-2015-0012", "UPLOADED"],
    ["RELEASE_AUTH", "Release Authorization Package", null, "MISSING"],
  ];
  const insertDoc = db.prepare(
    `INSERT INTO documents (escrow_id, category, title, reference, status, uploaded_at, verified_at, verified_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [cat, title, ref, status] of docs) {
    insertDoc.run(
      escrowId, cat, title, ref, status,
      status === "MISSING" ? null : "2015-04-06T15:00:00.000Z",
      status === "VERIFIED" ? "2015-04-07T11:30:00.000Z" : null,
      status === "VERIFIED" ? 2 : null
    );
  }

  db.prepare(
    `INSERT INTO obligations
     (escrow_id, kind, label, description, purpose, currency_code, amount_cents, status, test_record, created_at, updated_at)
     VALUES (?, 'RELEASE_TAX', ?, ?, ?, 'USD', ?, 'PENDING_VERIFICATION', 1, ?, ?)`
  ).run(
    escrowId,
    "Release Tax / Tax Obligation",
    "Example release-tax record configured FOR DEVELOPMENT AND TESTING ONLY. Not an assessed or verified tax liability.",
    "Escrow Release Tax - Test Record",
    TAX_TEST_CENTS,
    now(),
    now()
  );

  const payload = {
    certificate_reference: "SCL/COD/UK/2025/0821-FINAL",
    depositor: "Tabb Lyle Anderson",
    nationality: "United Kingdom",
    escrow_account: "SCL/223/GB-COD-075095",
    deposit_date: "2015-03-12",
    escrow_deposit: "$2,400,000.00 USD",
    physical_asset: "300 kg Alluvial Gold Bars - Purity 96.4% minimum",
    vault_reference: "ID SCL/UK/VLT-GD/MFH-300KG",
    custody_status: "Dormant Custodial Holding - Pending Legal Release",
    escrow_agent: "Margaret Halloway",
    next_of_kin: "Kendra Anderson",
  };
  db.prepare(
    `INSERT INTO certificates
     (escrow_id, reference, issued_on, status, verification_status, agent_name, document_history, payload_json, created_at)
     VALUES (?, ?, ?, 'TEST_DEVELOPMENT_RECORD', 'UNVERIFIED', ?, ?, ?, ?)`
  ).run(
    escrowId,
    "SCL/COD/UK/2025/0821-FINAL",
    "2025-08-21",
    "Margaret Halloway",
    JSON.stringify([
      { event: "CERTIFICATE_DRAFTED", at: "2025-08-21T08:00:00.000Z", by: "system@escrow.test", note: "Drafted as TEST/DEVELOPMENT RECORD" },
    ]),
    JSON.stringify(payload),
    now()
  );

  // Genesis audit entry (written through appendAudit so the chain verifies).
  appendAudit(db, {
    actor: null,
    action: "SYSTEM_INIT",
    entityType: "PLATFORM",
    entityId: "0",
    details: { initialized: true, seeded: "TEST DATA" },
  });

  console.log("[escrow-db] Seeded TEST data: 5 users (password Test123!), escrow account, ledger, stages, documents, obligations, certificate.");
}
