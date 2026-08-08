import { z } from "zod";

/**
 * RBAC: roles → capabilities (docs/10 §1–2). RBAC decides *who can ask*; the
 * Policy Engine decides *what may happen*. Both must pass. Capabilities are the
 * fine-grained checks enforced at the BFF and re-checked at the Control API.
 */

export const Role = z.enum([
  "viewer",
  "analyst",
  "optimizer",
  "client_admin",
  "platform_admin",
  "auditor",
  "ai_orchestrator",
]);
export type Role = z.infer<typeof Role>;

export const Capability = z.enum([
  "ads.read",
  "crm.read",
  "knowledge.read",
  "recommendation.read",
  "recommendation.approve",
  "recommendation.reject",
  "action.execute",
  "ads.action.request",
  "policy.read",
  "policy.configure",
  "audit.read",
  "pii.reidentify",
]);
export type Capability = z.infer<typeof Capability>;

const ALL: Capability[] = Capability.options;

/** Role → granted capabilities (docs/10 §1). */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  viewer: ["ads.read", "crm.read", "knowledge.read", "recommendation.read"],
  analyst: ["ads.read", "crm.read", "knowledge.read", "recommendation.read", "audit.read"],
  optimizer: [
    "ads.read", "crm.read", "knowledge.read", "recommendation.read",
    "recommendation.approve", "recommendation.reject", "action.execute", "audit.read",
  ],
  client_admin: [
    "ads.read", "crm.read", "knowledge.read", "recommendation.read",
    "recommendation.approve", "recommendation.reject", "action.execute",
    "policy.read", "policy.configure", "audit.read",
  ],
  platform_admin: ALL,
  auditor: ["recommendation.read", "audit.read", "pii.reidentify"],
  // The AI can read + draft/request, but never approve, execute, or configure.
  ai_orchestrator: ["ads.read", "crm.read", "knowledge.read", "ads.action.request"],
};

/** Resolve the union of capabilities for a set of roles. */
export function capabilitiesForRoles(roles: readonly Role[]): Capability[] {
  const set = new Set<Capability>();
  for (const r of roles) for (const c of ROLE_CAPABILITIES[r]) set.add(c);
  return [...set];
}
