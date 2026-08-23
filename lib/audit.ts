import crypto from "crypto";
import type { DatabaseSync } from "node:sqlite";
import type { SessionUser } from "./auth";

export interface AuditInput {
  actor: SessionUser | null; // null => SYSTEM
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: Record<string, unknown>;
}

/**
 * Append-only, hash-chained audit log.
 * Each entry commits to the previous entry's hash, making silent tampering
 * detectable via /api/audit?verify=1.
 */
export function appendAudit(db: DatabaseSync, input: AuditInput): void {
  const last = db.prepare("SELECT seq, entry_hash FROM audit_logs ORDER BY seq DESC LIMIT 1").get() as
    | { seq: number; entry_hash: string }
    | undefined;
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.entry_hash ?? "0".repeat(64);
  const createdAt = new Date().toISOString();

  const canonical = JSON.stringify({
    seq,
    actor_id: input.actor?.userId ?? null,
    actor_role: input.actor?.role ?? "SYSTEM",
    actor_email: input.actor?.email ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId != null ? String(input.entityId) : null,
    details: input.details ?? {},
    created_at: createdAt,
    prev_hash: prevHash,
  });
  const entryHash = crypto.createHash("sha256").update(canonical).digest("hex");

  db.prepare(
    `INSERT INTO audit_logs
     (seq, actor_id, actor_role, actor_email, action, entity_type, entity_id, details, prev_hash, entry_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    seq,
    input.actor?.userId ?? null,
    input.actor?.role ?? "SYSTEM",
    input.actor?.email ?? null,
    input.action,
    input.entityType,
    input.entityId != null ? String(input.entityId) : null,
    JSON.stringify(input.details ?? {}),
    prevHash,
    entryHash,
    createdAt
  );
}

export interface ChainVerification {
  valid: boolean;
  entriesChecked: number;
  firstBrokenAtSeq: number | null;
}

export function verifyAuditChain(db: DatabaseSync): ChainVerification {
  const rows = db.prepare("SELECT * FROM audit_logs ORDER BY seq ASC").all() as Array<{
    seq: number;
    actor_id: number | null;
    actor_role: string;
    actor_email: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: string;
    prev_hash: string;
    entry_hash: string;
    created_at: string;
  }>;

  let prevHash = "0".repeat(64);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const canonical = JSON.stringify({
      seq: r.seq,
      actor_id: r.actor_id,
      actor_role: r.actor_role,
      actor_email: r.actor_email,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      details: JSON.parse(r.details),
      created_at: r.created_at,
      prev_hash: r.prev_hash,
    });
    const recomputed = crypto.createHash("sha256").update(canonical).digest("hex");
    if (r.prev_hash !== prevHash || r.entry_hash !== recomputed) {
      return { valid: false, entriesChecked: i, firstBrokenAtSeq: r.seq };
    }
    prevHash = r.entry_hash;
  }
  return { valid: true, entriesChecked: rows.length, firstBrokenAtSeq: null };
}

/** Lightweight fraud/transaction monitoring heuristic: burst detection. */
export function detectAnomalies(
  db: DatabaseSync,
  windowSeconds = 60,
  threshold = 6
): Array<{ actor_email: string; count: number }> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT actor_email, COUNT(*) AS count FROM audit_logs
       WHERE actor_email IS NOT NULL AND created_at >= ?
       GROUP BY actor_email HAVING count >= ?`
    )
    .all(since, threshold) as Array<{ actor_email: string; count: number }>;
  return rows;
}
