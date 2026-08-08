import { createHmac } from "node:crypto";

/**
 * Deterministic, non-reversible pseudonymization (docs/09 §3).
 *
 * The same source identity always maps to the same pseudonym_id (so a lead can
 * be matched across CRM events), but the value cannot be reversed without the
 * secret salt — which lives only in the L1 boundary / secrets vault and is never
 * emitted downstream. This is the mechanism that keeps PII out of the analytical
 * warehouse, MCP contracts and the LLM.
 */

/** Normalize an identifier so trivial variations map to the same pseudonym. */
export function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * pseudonym_id = HMAC-SHA256(salt, normalized identity), hex.
 * `salt` is a secret; in production it is loaded from the vault, never hardcoded.
 */
export function pseudonymize(identity: string, salt: string): string {
  if (!salt) throw new Error("pseudonymization salt is required");
  return createHmac("sha256", salt)
    .update(normalizeIdentifier(identity))
    .digest("hex");
}
