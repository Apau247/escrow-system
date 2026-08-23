import type { DatabaseSync } from "node:sqlite";
import type { SessionUser } from "./auth";
import { appendAudit } from "./audit";
import { can, DUAL_AUTH_ROLES, type Action } from "./rbac";

export const STAGE_KEYS = [
  "ESCROW_DEPOSIT_RECORDED",
  "CUSTOMER_VERIFICATION",
  "ESCROW_AGREEMENT_VERIFICATION",
  "CUSTODY_VERIFICATION",
  "COMPLIANCE_REVIEW",
  "RELEASE_TAX_OBLIGATION_VERIFICATION",
  "RELEASE_CONDITIONS_SATISFIED",
  "ESCROW_AGENT_AUTHORIZATION",
  "DISBURSEMENT_AUTHORIZATION",
  "ESCROW_RELEASE",
  "SETTLEMENT",
  "ESCROW_CLOSURE",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

const STAGE_PERMISSION: Partial<Record<StageKey, Action>> = {
  COMPLIANCE_REVIEW: "compliance.complete",
  RELEASE_TAX_OBLIGATION_VERIFICATION: "obligation.authorize",
  ESCROW_AGENT_AUTHORIZATION: "agent.authorize",
  DISBURSEMENT_AUTHORIZATION: "disburse.approve",
  ESCROW_RELEASE: "release.execute",
  SETTLEMENT: "settlement.execute",
  ESCROW_CLOSURE: "closure.execute",
};

export interface EscrowBalances {
  total_balance_cents: number;
  restricted_cents: number;
  pending_release_cents: number;
  released_cents: number;
  charges_cents: number;
  final_disbursement_cents: number;
  currency_code: string;
}

export function computeBalances(db: DatabaseSync, escrowId: number): EscrowBalances {
  const escrow = db.prepare("SELECT * FROM escrow_accounts WHERE id = ?").get(escrowId) as {
    principal_amount_cents: number;
    currency_code: string;
  };
  const sum = (type: string) => {
    const r = db
      .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM ledger_entries WHERE escrow_id = ? AND entry_type = ?")
      .get(escrowId, type) as { s: number };
    return r.s;
  };
  const released = sum("RELEASE");
  const charges = sum("CHARGE");
  const held = sum("RESERVE") - sum("UNRESERVE");
  const total = escrow.principal_amount_cents;
  return {
    total_balance_cents: total,
    restricted_cents: total - released - charges - held,
    pending_release_cents: held,
    released_cents: released,
    charges_cents: charges,
    final_disbursement_cents: Math.max(0, total - released - charges - held),
    currency_code: escrow.currency_code,
  };
}

export function getEscrowId(db: DatabaseSync): number {
  const row = db.prepare("SELECT id FROM escrow_accounts ORDER BY id LIMIT 1").get() as { id: number };
  return row.id;
}

export function getStage(db: DatabaseSync, escrowId: number, key: StageKey) {
  return db.prepare("SELECT * FROM timeline_stages WHERE escrow_id = ? AND key = ?").get(escrowId, key) as
    | {
        id: number;
        seq: number;
        key: string;
        name: string;
        department: string;
        status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
        completed_at: string | null;
      }
    | undefined;
}

export class WorkflowError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export function recordStageEvent(
  db: DatabaseSync,
  stageId: number,
  actor: SessionUser | null,
  action: string,
  note?: string
) {
  db.prepare(
    `INSERT INTO stage_events (stage_id, actor_id, actor_role, action, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(stageId, actor?.userId ?? null, actor?.role ?? "SYSTEM", action, note ?? null, new Date().toISOString());
}

function completeStage(db: DatabaseSync, stageId: number, byLabel: string, note: string) {
  db.prepare(
    "UPDATE timeline_stages SET status = 'COMPLETED', completed_at = ?, completed_by = ?, notes = ? WHERE id = ?"
  ).run(new Date().toISOString(), byLabel, note, stageId);
}

function setEscrowUpdated(db: DatabaseSync, escrowId: number) {
  db.prepare("UPDATE escrow_accounts SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), escrowId);
}

/** System-driven stage evaluation: runs after every mutation. */
export function recomputeSystemStages(db: DatabaseSync, escrowId: number): void {
  // Stage 7 (auto): satisfied when stages 1..6 are all complete.
  const s7 = getStage(db, escrowId, "RELEASE_CONDITIONS_SATISFIED");
  if (s7 && s7.status !== "COMPLETED") {
    const priorComplete = STAGE_KEYS.slice(0, 6).every((k) => getStage(db, escrowId, k)?.status === "COMPLETED");
    if (priorComplete) {
      completeStage(db, s7.id, "SYSTEM", "All preceding release conditions satisfied (system-evaluated).");
      recordStageEvent(db, s7.id, null, "AUTO_COMPLETE", "All preceding release conditions satisfied.");
      appendAudit(db, {
        actor: null,
        action: "STAGE_AUTO_COMPLETE",
        entityType: "TIMELINE_STAGE",
        entityId: `STAGE:${s7.key}`,
        details: { reason: "stages_1_to_6_completed" },
      });
    }
  }
  syncInProgressFlags(db, escrowId);
}

function syncInProgressFlags(db: DatabaseSync, escrowId: number): void {
  let prevComplete = true;
  for (const key of STAGE_KEYS) {
    const stage = getStage(db, escrowId, key)!;
    if (stage.status === "COMPLETED") continue;
    const nextStatus = prevComplete ? "IN_PROGRESS" : "PENDING";
    if (stage.status !== nextStatus) {
      db.prepare("UPDATE timeline_stages SET status = ? WHERE id = ?").run(nextStatus, stage.id);
    }
    prevComplete = false;
  }
}

export function getDualApprovals(db: DatabaseSync, escrowId: number, actionKey: string): any[] {
  return db
    .prepare(
      `SELECT a.*, u.name AS approver_name FROM approvals a JOIN users u ON u.id = a.approver_id
       WHERE a.action_key = ? AND a.escrow_id = ? ORDER BY a.created_at ASC`
    )
    .all(actionKey, escrowId) as any[];
}

/**
 * Execute a manual stage transition. Enforces strict sequential order, RBAC,
 * dual authorization on disbursement, and full-document verification gates.
 * Every transition is recorded in stage_events and in the hash-chained audit log.
 */
export function performStageAction(
  db: DatabaseSync,
  escrowId: number,
  stageKey: StageKey,
  actor: SessionUser,
  note?: string
): { ok: true; message: string } {
  const stage = getStage(db, escrowId, stageKey);
  if (!stage) throw new WorkflowError("Stage not found.", 404);

  const idx = STAGE_KEYS.indexOf(stageKey);
  const missingPrior = STAGE_KEYS.slice(0, idx).filter((k) => getStage(db, escrowId, k)?.status !== "COMPLETED");
  if (missingPrior.length > 0) {
    throw new WorkflowError(`Blocked: preceding stage(s) incomplete: ${missingPrior.join(", ")}.`, 409);
  }
  if (stage.status === "COMPLETED") throw new WorkflowError("Stage already completed.", 409);

  const permission = STAGE_PERMISSION[stageKey];
  if (permission && !can(actor.role, permission)) {
    throw new WorkflowError(`Role ${actor.role} is not authorized for this stage action.`, 403);
  }

  switch (stageKey) {
    case "RELEASE_TAX_OBLIGATION_VERIFICATION": {
      const ob = db
        .prepare("SELECT status FROM obligations WHERE escrow_id = ? AND status != 'REJECTED'")
        .all(escrowId) as Array<{ status: string }>;
      const posted = ob.length > 0 && ob.every((o) => o.status === "POSTED");
      if (!posted) {
        throw new WorkflowError(
          "Blocked: the release tax/obligation has not completed its chain of Assessment → Verification → Compliance Review → Agent Approval → Posting. This platform intentionally provides NO automatic payment-to-release mechanism.",
          409
        );
      }
      break;
    }
    case "ESCROW_RELEASE": {
      const bal = computeBalances(db, escrowId);
      if (bal.pending_release_cents <= 0) {
        throw new WorkflowError("Blocked: no authorized funds are held pending release.", 409);
      }
      break;
    }
    default:
      break;
  }

  // Dual authorization gate for disbursement.
  if (stageKey === "DISBURSEMENT_AUTHORIZATION") {
    const unverifiedDocs = db
      .prepare("SELECT title FROM documents WHERE escrow_id = ? AND status != 'VERIFIED'")
      .all(escrowId) as Array<{ title: string }>;
    if (unverifiedDocs.length > 0) {
      throw new WorkflowError(
        `Blocked: all custody/release documents must be VERIFIED first. Outstanding: ${unverifiedDocs.map((d) => d.title).join("; ")}`,
        409
      );
    }
    if (!DUAL_AUTH_ROLES.includes(actor.role)) {
      throw new WorkflowError(`Role ${actor.role} may not co-sign disbursement authorization.`, 403);
    }
    const actionKey = `STAGE:${stageKey}`;
    const existing = getDualApprovals(db, escrowId, actionKey);
    if (existing.some((a: any) => a.approver_id === actor.userId)) {
      throw new WorkflowError("You have already approved this disbursement. A second distinct authorized officer is required.", 409);
    }
    db.prepare(
      `INSERT INTO approvals (action_key, escrow_id, approver_id, approver_role, decision, created_at)
       VALUES (?, ?, ?, ?, 'APPROVED', ?)`
    ).run(actionKey, escrowId, actor.userId, actor.role, new Date().toISOString());
    recordStageEvent(db, stage.id, actor, "DUAL_AUTH_APPROVAL", note);

    const approvals = getDualApprovals(db, escrowId, actionKey);
    const distinctRoles = new Set(approvals.map((a: any) => a.approver_id));
    if (distinctRoles.size < 2 || approvals.length < 2) {
      appendAudit(db, {
        actor,
        action: "DUAL_AUTH_PARTIAL",
        entityType: "TIMELINE_STAGE",
        entityId: `STAGE:${stageKey}`,
        details: { approvals: approvals.length, required: 2 },
      });
      recomputeSystemStages(db, escrowId);
      return {
        ok: true,
        message: `First approval recorded (${approvals.length}/2). Dual authorization requires one Finance Officer and one Escrow Agent — two distinct individuals.`,
      };
    }

    // Both approvals present -> reserve funds and complete the stage.
    const bal = computeBalances(db, escrowId);
    if (bal.final_disbursement_cents <= 0) throw new WorkflowError("Nothing left to authorize for disbursement.", 409);
    db.prepare(
      `INSERT INTO ledger_entries (escrow_id, entry_type, reference, currency_code, amount_cents, memo, created_by, created_at)
       VALUES (?, 'RESERVE', ?, ?, ?, ?, ?, ?)`
    ).run(
      escrowId,
      `SCL-TXN-RES-${Date.now()}`,
      bal.currency_code,
      bal.final_disbursement_cents,
      "Funds reserved pending settlement after dual authorization [TEST DATA]",
      actor.userId,
      new Date().toISOString()
    );
    completeStage(
      db,
      stage.id,
      `${approvals.map((a: any) => `${a.approver_name} (${a.approver_role})`).join(" + ")}`,
      note || "Dual authorization satisfied."
    );
    appendAudit(db, {
      actor,
      action: "STAGE_COMPLETED",
      entityType: "TIMELINE_STAGE",
      entityId: `STAGE:${stageKey}`,
      details: { dual_authorization: true, approvers: approvals.map((a: any) => a.approver_email), reserved_cents: bal.final_disbursement_cents },
    });
    recomputeSystemStages(db, escrowId);
    setEscrowUpdated(db, escrowId);
    return { ok: true, message: "Dual authorization satisfied. Funds reserved pending release." };
  }

  // Standard completion path.
  completeStage(db, stage.id, `${actor.name} (${actor.role})`, note || `Completed by ${actor.name}.`);
  recordStageEvent(db, stage.id, actor, "MANUAL_COMPLETE", note);

  if (stageKey === "ESCROW_RELEASE") {
    const bal = computeBalances(db, escrowId);
    const heldAmount = bal.pending_release_cents;
    const nowIso = new Date().toISOString();
    const tx = db.prepare(
      `INSERT INTO ledger_entries (escrow_id, entry_type, reference, currency_code, amount_cents, memo, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    tx.run(escrowId, "UNRESERVE", `SCL-TXN-UNR-${Date.now()}`, bal.currency_code, heldAmount, "Release of reservation upon escrow release [TEST DATA]", actor.userId, nowIso);
    tx.run(escrowId, "RELEASE", `SCL-TXN-REL-${Date.now()}`, bal.currency_code, heldAmount, "Escrow funds released to beneficiary instructions [TEST DATA]", actor.userId, nowIso);
  }

  if (stageKey === "ESCROW_CLOSURE") {
    db.prepare("UPDATE escrow_accounts SET status_code = 'CLOSED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), escrowId);
  }

  appendAudit(db, {
    actor,
    action: "STAGE_COMPLETED",
    entityType: "TIMELINE_STAGE",
    entityId: `STAGE:${stageKey}`,
    details: { note: note ?? null },
  });
  recomputeSystemStages(db, escrowId);
  setEscrowUpdated(db, escrowId);
  return { ok: true, message: `Stage '${stage.name}' completed.` };
}
