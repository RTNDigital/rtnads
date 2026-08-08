import { z } from "zod";
import { Uuid, EntityType } from "./common.js";

/**
 * CRM warehouse row contracts (docs/03 §crm, docs/09 §3).
 *
 * These are, by construction, INCAPABLE of expressing PII: a lead is identified
 * only by an opaque `pseudonym_id`, and `attributes` is restricted to non-
 * identifying qualifiers. Pseudonymization happens at the L1 boundary; the
 * identity map lives in a separate PII vault the analytical path cannot reach.
 */

export const LeadQualityBand = z.enum(["low", "mid", "high"]);
export type LeadQualityBand = z.infer<typeof LeadQualityBand>;

export const SalesQualityBand = z.enum(["standard", "premium"]);
export type SalesQualityBand = z.infer<typeof SalesQualityBand>;

export const CrmLeadRow = z.object({
  /** Opaque, stable, non-reversible identifier (HMAC of the source identity). */
  pseudonym_id: z.string().min(1),
  /** Advertising entity this lead is attributed to (by external id). */
  attributed_entity_type: EntityType.nullable().default(null),
  attributed_external_id: z.string().nullable().default(null),
  source_platform: z.string(),
  created_at: z.string().datetime(),
  lead_quality: LeadQualityBand.nullable().default(null),
  /** Non-PII qualifiers only (e.g. procedure interest, market). */
  attributes: z.record(z.string(), z.unknown()).default({}),
});
export type CrmLeadRow = z.infer<typeof CrmLeadRow>;

export const FunnelEventRow = z.object({
  pseudonym_id: z.string().min(1),
  stage_key: z.string().min(1), // resolved to a funnel_stage id at load time
  occurred_at: z.string().datetime(),
  value_minor: z.number().int().nullable().default(null),
});
export type FunnelEventRow = z.infer<typeof FunnelEventRow>;

export const SaleRow = z.object({
  pseudonym_id: z.string().min(1),
  occurred_at: z.string().datetime(),
  revenue_minor: z.number().int().nonnegative(),
  margin_minor: z.number().int().nullable().default(null),
  customer_value_minor: z.number().int().nullable().default(null),
  sales_quality: SalesQualityBand.nullable().default(null),
  currency: z.string().length(3),
});
export type SaleRow = z.infer<typeof SaleRow>;

/** Normalized CRM sync — the L1→L2 boundary for outcome data. */
export const NormalizedCrmSync = z.object({
  client_id: Uuid,
  /** Vertical taxonomy path scoping the funnel stage set (e.g. "health-tourism"). */
  vertical_path: z.string().min(1),
  leads: z.array(CrmLeadRow),
  events: z.array(FunnelEventRow),
  sales: z.array(SaleRow),
});
export type NormalizedCrmSync = z.infer<typeof NormalizedCrmSync>;
