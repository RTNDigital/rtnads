import { z } from "zod";
import { Money } from "./common.js";

/**
 * Deterministic analytics result contracts (docs/07 §L3 Analytics Engine).
 * These are outputs of pure computation over warehouse facts + CRM outcomes.
 *
 * Money-valued ratios are NULLABLE on purpose: when a denominator is zero we
 * return null, never a fabricated/infinite value. "Evidence, not proof"
 * (docs/00 §3) starts with not inventing numbers.
 */

export const MetricTotals = z.object({
  currency: z.string().length(3),
  spend: Money,
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  conversions: z.number().nonnegative(),
  conversion_value: Money,
});
export type MetricTotals = z.infer<typeof MetricTotals>;

export const DerivedMetrics = z.object({
  ctr: z.number().nullable(), // clicks / impressions
  cpc: Money.nullable(), // spend / clicks
  cpl: Money.nullable(), // spend / conversions(leads)
  cpa: Money.nullable(), // spend / conversions
  roas: z.number().nullable(), // conversion_value / spend
});
export type DerivedMetrics = z.infer<typeof DerivedMetrics>;

export const FunnelStageResult = z.object({
  key: z.string(),
  label: z.string(),
  ordinal: z.number().int(),
  count: z.number().int().nonnegative(),
  /** Conversion rate from the previous stage, null for the first stage. */
  rate_from_prev: z.number().min(0).nullable(),
});
export type FunnelStageResult = z.infer<typeof FunnelStageResult>;

export const FunnelResult = z.object({
  stages: z.array(FunnelStageResult),
  /** End-to-end rate from the first to the last stage. */
  overall_rate: z.number().min(0).nullable(),
});
export type FunnelResult = z.infer<typeof FunnelResult>;

export const UnitEconomicsModel = z.enum([
  "health_tourism",
  "ecommerce",
  "services",
]);
export type UnitEconomicsModel = z.infer<typeof UnitEconomicsModel>;

export const UnitEconomicsAssumptions = z.object({
  attribution_window_days: z.number().int().positive(),
  margin_rate: z.number().min(0).max(1),
});
export type UnitEconomicsAssumptions = z.infer<typeof UnitEconomicsAssumptions>;

/**
 * Business-specific unit economics (docs/02 §6, docs/11). Health Tourism does not
 * optimize for CPL alone — cost per QUALIFIED lead, cost per booking, CAC and
 * revenue per lead are first-class.
 */
export const UnitEconomics = z.object({
  model: UnitEconomicsModel,
  currency: z.string().length(3),
  cpl: Money.nullable(),
  cost_per_qualified_lead: Money.nullable(),
  cost_per_booking: Money.nullable(),
  cac: Money.nullable(),
  revenue_per_lead: Money.nullable(),
  roas: z.number().nullable(),
  contribution_margin: Money.nullable(),
  assumptions: UnitEconomicsAssumptions,
});
export type UnitEconomics = z.infer<typeof UnitEconomics>;
