import type { Role } from "./auth";

export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: "Customer",
  ESCROW_AGENT: "Escrow Agent",
  COMPLIANCE_OFFICER: "Compliance Officer",
  FINANCE_OFFICER: "Finance Officer",
  ADMIN: "Administrator",
};

export type Action =
  | "compliance.complete"
  | "obligation.verify"
  | "obligation.review"
  | "obligation.approve"
  | "obligation.authorize"
  | "agent.authorize"
  | "disburse.approve"
  | "release.execute"
  | "settlement.execute"
  | "closure.execute"
  | "document.upload"
  | "document.verify"
  | "certificate.issue";

/** Least-privilege matrix. ADMIN is a break-glass role: every ADMIN action is audited. */
const MATRIX: Record<Action, Role[]> = {
  "compliance.complete": ["COMPLIANCE_OFFICER", "ADMIN"],
  "obligation.verify": ["FINANCE_OFFICER", "ADMIN"],
  "obligation.review": ["COMPLIANCE_OFFICER", "ADMIN"],
  "obligation.approve": ["ESCROW_AGENT", "ADMIN"],
  "obligation.authorize": ["FINANCE_OFFICER", "ADMIN"],
  "agent.authorize": ["ESCROW_AGENT", "ADMIN"],
  "disburse.approve": ["FINANCE_OFFICER", "ESCROW_AGENT", "ADMIN"],
  "release.execute": ["FINANCE_OFFICER", "ADMIN"],
  "settlement.execute": ["FINANCE_OFFICER", "ADMIN"],
  "closure.execute": ["ADMIN"],
  "document.upload": ["COMPLIANCE_OFFICER", "ESCROW_AGENT", "FINANCE_OFFICER", "ADMIN"],
  "document.verify": ["COMPLIANCE_OFFICER", "ESCROW_AGENT", "ADMIN"],
  "certificate.issue": ["ADMIN"],
};

export const ACTION_KEYS = Object.keys(MATRIX) as Action[];

export function actionsFor(role: Role): Action[] {
  return ACTION_KEYS.filter((a) => MATRIX[a].includes(role));
}

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}

/** Roles whose holders may co-sign the dual-authorization disbursement gate. */
export const DUAL_AUTH_ROLES: Role[] = ["FINANCE_OFFICER", "ESCROW_AGENT"];
