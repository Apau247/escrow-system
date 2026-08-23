import type { DatabaseSync } from "node:sqlite";
import { computeBalances, getDualApprovals, STAGE_KEYS } from "./workflow";
import { detectAnomalies, verifyAuditChain } from "./audit";

export function getPortalData(db: DatabaseSync) {
  const escrow = db.prepare("SELECT * FROM escrow_accounts ORDER BY id LIMIT 1").get() as any;
  const balances = computeBalances(db, escrow.id);

  const stages = (
    db.prepare("SELECT * FROM timeline_stages WHERE escrow_id = ? ORDER BY seq ASC").all(escrow.id) as any[]
  ).map((s) => ({
    ...s,
    responsible_roles: JSON.parse(s.responsible_roles || "[]"),
  }));

  const stageEvents = db
    .prepare(
      `SELECT e.*, u.name AS actor_name, s.key AS stage_key FROM stage_events e
       JOIN timeline_stages s ON s.id = e.stage_id LEFT JOIN users u ON u.id = e.actor_id
       WHERE s.escrow_id = ? ORDER BY e.created_at DESC LIMIT 50`
    )
    .all(escrow.id);

  const obligations = db
    .prepare("SELECT * FROM obligations WHERE escrow_id = ? ORDER BY created_at ASC")
    .all(escrow.id);

  const documents = db.prepare("SELECT * FROM documents WHERE escrow_id = ? ORDER BY id ASC").all(escrow.id);

  const certificateRow = db.prepare("SELECT * FROM certificates WHERE escrow_id = ?").get(escrow.id) as any;
  const certificate = certificateRow
    ? {
        ...certificateRow,
        document_history: JSON.parse(certificateRow.document_history || "[]"),
        payload: JSON.parse(certificateRow.payload_json || "{}"),
      }
    : null;

  const ledger = db
    .prepare("SELECT l.*, u.name AS created_by_name FROM ledger_entries l LEFT JOIN users u ON u.id = l.created_by WHERE l.escrow_id = ? ORDER BY l.created_at ASC")
    .all(escrow.id);

  const dualApprovals = getDualApprovals(db, escrow.id, "STAGE:DISBURSEMENT_AUTHORIZATION");

  const audit = db
    .prepare("SELECT seq, actor_role, actor_email, action, entity_type, entity_id, details, created_at FROM audit_logs ORDER BY seq DESC LIMIT 200")
    .all();

  const chain = verifyAuditChain(db);
  const anomalies = detectAnomalies(db);

  const assetFields = {
    physical_asset: escrow.asset_description,
    purity: escrow.asset_purity,
    vault_reference: escrow.vault_reference,
    custodial_status: escrow.custodial_status,
  };

  return {
    escrow,
    balances,
    stages,
    stageEvents,
    obligations,
    documents,
    certificate,
    ledger,
    dualApprovals,
    audit,
    chain,
    anomalies,
    assetFields,
    workflowOrder: STAGE_KEYS,
  };
}
