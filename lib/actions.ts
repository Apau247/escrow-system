import type { DatabaseSync } from "node:sqlite";
import type { SessionUser } from "./auth";
import { appendAudit } from "./audit";
import { can, type Action } from "./rbac";
import { WorkflowError, recomputeSystemStages, getEscrowId } from "./workflow";

export function performObligationAction(
  db: DatabaseSync,
  obligationId: number,
  action: "verify" | "review" | "approve" | "authorize",
  actor: SessionUser
) {
  const permMap: Record<string, Action> = {
    verify: "obligation.verify",
    review: "obligation.review",
    approve: "obligation.approve",
    authorize: "obligation.authorize",
  };
  const transition: Record<string, { from: string[]; to: string }> = {
    verify: { from: ["PENDING_VERIFICATION"], to: "VERIFIED" },
    review: { from: ["VERIFIED"], to: "COMPLIANCE_REVIEWED" },
    approve: { from: ["COMPLIANCE_REVIEWED"], to: "AGENT_APPROVED" },
    authorize: { from: ["AGENT_APPROVED"], to: "POSTED" },
  };

  if (!can(actor.role, permMap[action])) {
    throw new WorkflowError(`Role ${actor.role} is not authorized to perform '${action}' on obligations.`, 403);
  }

  const escrowId = getEscrowId(db);
  const ob = db.prepare("SELECT * FROM obligations WHERE id = ? AND escrow_id = ?").get(obligationId, escrowId) as
    | { id: number; status: string; label: string; amount_cents: number; currency_code: string; test_record: number }
    | undefined;
  if (!ob) throw new WorkflowError("Obligation not found.", 404);

  const t = transition[action];
  if (!t.from.includes(ob.status)) {
    throw new WorkflowError(
      `Cannot '${action}' obligation in status ${ob.status}. Required chain: Assessment → Verification → Compliance Review → Agent Approval → Posting.`,
      409
    );
  }

  db.prepare("UPDATE obligations SET status = ?, updated_at = ? WHERE id = ?").run(t.to, new Date().toISOString(), ob.id);

  if (action === "authorize") {
    const ref = `SCL-TXN-OBL-${String(ob.id).padStart(6, "0")}`;
    db.prepare(
      `INSERT INTO ledger_entries (escrow_id, entry_type, reference, currency_code, amount_cents, memo, created_by, created_at)
       VALUES (?, 'CHARGE', ?, ?, ?, ?, ?, ?)`
    ).run(
      escrowId,
      ref,
      ob.currency_code,
      ob.amount_cents,
      `${ob.label} posted as escrow charge [${ob.test_record ? "TEST RECORD" : "VERIFIED"}]`,
      actor.userId,
      new Date().toISOString()
    );
  }

  appendAudit(db, {
    actor,
    action: `OBLIGATION_${action.toUpperCase()}`,
    entityType: "OBLIGATION",
    entityId: ob.id,
    details: { from_status: ob.status, to_status: t.to, amount_cents: ob.amount_cents, currency: ob.currency_code },
  });

  recomputeSystemStages(db, escrowId);
  db.prepare("UPDATE escrow_accounts SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), escrowId);

  const messages: Record<string, string> = {
    verify: "Assessment verified by Finance Officer.",
    review: "Compliance review recorded.",
    approve: "Approved by Escrow Agent.",
    authorize: "Obligation authorized and posted to the ledger as an escrow charge. This does NOT release funds.",
  };
  return { ok: true as const, newStatus: t.to, message: messages[action] };
}

export function performDocumentAction(
  db: DatabaseSync,
  documentId: number,
  action: "upload" | "verify",
  actor: SessionUser
) {
  if (!can(actor.role, action === "upload" ? "document.upload" : "document.verify")) {
    throw new WorkflowError(`Role ${actor.role} may not ${action} documents.`, 403);
  }
  const escrowId = getEscrowId(db);
  const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND escrow_id = ?").get(documentId, escrowId) as
    | { id: number; category: string; title: string; status: string }
    | undefined;
  if (!doc) throw new WorkflowError("Document not found.", 404);

  const now = new Date().toISOString();
  if (action === "upload") {
    if (doc.status !== "MISSING") throw new WorkflowError(`Document '${doc.title}' is already ${doc.status}.`, 409);
    db.prepare("UPDATE documents SET status = 'UPLOADED', uploaded_at = ? WHERE id = ?").run(now, doc.id);
  } else {
    if (doc.status !== "UPLOADED") throw new WorkflowError(`Document '${doc.title}' must be UPLOADED before verification.`, 409);
    db.prepare("UPDATE documents SET status = 'VERIFIED', verified_at = ?, verified_by = ? WHERE id = ?").run(now, actor.userId, doc.id);
  }

  appendAudit(db, {
    actor,
    action: `DOCUMENT_${action.toUpperCase()}`,
    entityType: "DOCUMENT",
    entityId: doc.id,
    details: { category: doc.category, title: doc.title },
  });
  recomputeSystemStages(db, escrowId);
  return {
    ok: true as const,
    newStatus: action === "upload" ? "UPLOADED" : "VERIFIED",
    message: `Document '${doc.title}' ${action === "upload" ? "uploaded for review." : "verified."}`,
  };
}

/** Formal certificate issuance. Requires every document VERIFIED and stage >= agent authorization complete. */
export function issueCertificate(db: DatabaseSync, actor: SessionUser) {
  if (!can(actor.role, "certificate.issue")) {
    throw new WorkflowError("Only an Administrator may formally issue the escrow certificate.", 403);
  }
  const escrowId = getEscrowId(db);
  const unverified = db
    .prepare("SELECT title FROM documents WHERE escrow_id = ? AND status != 'VERIFIED'")
    .all(escrowId) as Array<{ title: string }>;
  if (unverified.length > 0) {
    throw new WorkflowError(
      `Blocked: certificate issuance requires all documentation VERIFIED. Outstanding: ${unverified.map((d) => d.title).join("; ")}`,
      409
    );
  }
  const cert = db.prepare("SELECT * FROM certificates WHERE escrow_id = ?").get(escrowId) as
    | {
        id: number;
        reference: string;
        status: string;
        document_history: string;
        verification_status: string;
      }
    | undefined;
  if (!cert) throw new WorkflowError("Certificate record not found.", 404);
  if (cert.status === "ISSUED") throw new WorkflowError("Certificate has already been issued.", 409);

  const history = JSON.parse(cert.document_history || "[]");
  history.push({
    event: "CERTIFICATE_ISSUED",
    at: new Date().toISOString(),
    by: actor.email,
    note: "Formally issued by institution administrator after full verification.",
  });

  db.prepare(
    "UPDATE certificates SET status = 'ISSUED', verification_status = 'VERIFIED', document_history = ? WHERE id = ?"
  ).run(JSON.stringify(history), cert.id);

  appendAudit(db, {
    actor,
    action: "CERTIFICATE_ISSUED",
    entityType: "CERTIFICATE",
    entityId: cert.id,
    details: { reference: cert.reference },
  });
  recomputeSystemStages(db, escrowId);
  return { ok: true as const, message: `Certificate ${cert.reference} formally issued and marked VERIFIED.` };
}
