import { z } from "zod";

/**
 * Common, cross-cutting contract primitives shared by every boundary.
 * See docs/05-mcp-tool-contracts.md and docs/06-api-boundaries.md.
 */

/** Canonical advertising entity kinds (platform-normalized). */
export const EntityType = z.enum([
  "account",
  "campaign",
  "ad_set",
  "ad",
  "creative",
]);
export type EntityType = z.infer<typeof EntityType>;

/** A UUID surrogate id. External platform ids are never used as internal keys. */
export const Uuid = z.string().uuid();
export type Uuid = z.infer<typeof Uuid>;

/** A typed reference to an advertising entity. */
export const EntityRef = z.object({
  type: EntityType,
  id: Uuid,
});
export type EntityRef = z.infer<typeof EntityRef>;

/**
 * Money is always stored/transported in minor units with an explicit currency.
 * Never a floating-point major-unit amount.
 */
export const Money = z.object({
  amount_minor: z.number().int(),
  currency: z.string().length(3), // ISO 4217
});
export type Money = z.infer<typeof Money>;

/** An inclusive date window (calendar dates, not timestamps). */
export const DateWindow = z.object({
  start: z.string().date(),
  end: z.string().date(),
});
export type DateWindow = z.infer<typeof DateWindow>;

/**
 * The context vector: contextual dimensions attached to an entity.
 * Industry category alone is never the sole optimization context
 * (docs/02-domain-model.md §4). Dimensions are an open registry, so this is a
 * permissive record keyed by dimension key.
 */
export const ContextVector = z.record(z.string(), z.string());
export type ContextVector = z.infer<typeof ContextVector>;

/**
 * Scoped authorization context, attached out-of-band by the orchestrator's
 * trusted session and RE-VALIDATED server-side. Never free text from the LLM,
 * and never carries credentials (docs/09-security-model.md).
 */
export const Authz = z.object({
  client_id: Uuid,
  principal: z.string(), // "user:<uuid>" | "system:<service>"
  capabilities: z.array(z.string()),
});
export type Authz = z.infer<typeof Authz>;

/** Data-quality descriptor accompanying deterministic results. */
export const DataQuality = z.object({
  freshness_hours: z.number().nonnegative(),
  completeness: z.number().min(0).max(1),
  sample_size: z.number().int().nonnegative(),
});
export type DataQuality = z.infer<typeof DataQuality>;

/** Metadata attached to every deterministic MCP/service response. */
export const ResponseMeta = z.object({
  computed_at: z.string().datetime(),
  evidence_window: DateWindow.optional(),
  data_quality: DataQuality.optional(),
  /** Which deterministic service produced this (e.g. "analytics-engine@1.4.2"). */
  provenance: z.string(),
});
export type ResponseMeta = z.infer<typeof ResponseMeta>;

export const ErrorBody = z.object({
  code: z.string(),
  message: z.string(),
  retriable: z.boolean().default(false),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/**
 * Standard structured response envelope. Every tool returns typed JSON — never a
 * prose blob the LLM must parse (docs/04-mcp-architecture.md rule 3).
 */
export function responseEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data, meta: ResponseMeta }),
    z.object({ ok: z.literal(false), error: ErrorBody }),
  ]);
}
