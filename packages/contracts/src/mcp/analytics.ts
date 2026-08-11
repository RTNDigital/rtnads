import { z } from "zod";
import {
  Authz,
  EntityRef,
  Uuid,
  Money,
  DateWindow,
  ContextVector,
} from "../common.js";

/**
 * Ads Analytics MCP — read-only tool contracts (subset).
 * The MCP server is a thin adapter over the deterministic L3 engines; it computes
 * nothing itself (docs/04-mcp-architecture.md, docs/05-mcp-tool-contracts.md §A).
 */

// ── get_account_snapshot ────────────────────────────────────────────────────
export const GetAccountSnapshotInput = z.object({
  authz: Authz,
  account: Uuid,
  window: DateWindow,
});
export type GetAccountSnapshotInput = z.infer<typeof GetAccountSnapshotInput>;

export const GetAccountSnapshotData = z.object({
  account: z.object({
    id: Uuid,
    name: z.string(),
    platform: z.string(),
    maturity: z.enum(["new", "ramping", "mature"]),
  }),
  totals: z.object({
    spend: Money,
    impressions: z.number().int().nonnegative(),
    clicks: z.number().int().nonnegative(),
    conversions: z.number().nonnegative(),
    conversion_value: Money,
  }),
  derived: z.object({
    ctr: z.number(),
    cpc: Money,
    cpl: Money,
    cpa: Money,
    roas: z.number(),
  }),
  health: z.object({
    score: z.number().min(0).max(100),
    flags: z.array(z.string()),
  }),
  context: ContextVector,
});
export type GetAccountSnapshotData = z.infer<typeof GetAccountSnapshotData>;

// ── calculate_unit_economics ────────────────────────────────────────────────
export const UnitEconomicsModel = z.enum([
  "health_tourism",
  "ecommerce",
  "services",
]);
export type UnitEconomicsModel = z.infer<typeof UnitEconomicsModel>;

export const CalculateUnitEconomicsInput = z.object({
  authz: Authz,
  entity: EntityRef,
  window: DateWindow,
  model: UnitEconomicsModel,
});
export type CalculateUnitEconomicsInput = z.infer<
  typeof CalculateUnitEconomicsInput
>;

export const CalculateUnitEconomicsData = z.object({
  cpl: Money,
  cost_per_qualified_lead: Money,
  cost_per_booking: Money,
  cac: Money,
  revenue_per_lead: Money,
  roas: z.number(),
  contribution_margin: Money,
  assumptions: z.object({
    attribution_window_days: z.number().int(),
    margin_rate: z.number().min(0).max(1),
  }),
});
export type CalculateUnitEconomicsData = z.infer<
  typeof CalculateUnitEconomicsData
>;

// ── find_similar_campaigns ──────────────────────────────────────────────────
export const FindSimilarCampaignsInput = z.object({
  authz: Authz,
  subject: EntityRef,
  attributes: z.array(z.string()),
  limit: z.number().int().positive().default(25),
  min_similarity: z.number().min(0).max(1).default(0.5),
  recency_half_life_days: z.number().positive().default(180),
});
export type FindSimilarCampaignsInput = z.infer<
  typeof FindSimilarCampaignsInput
>;

export const CohortMember = z.object({
  campaign: EntityRef,
  similarity: z.number().min(0).max(1),
  influence: z.number().min(0).max(1),
  recency_days: z.number().nonnegative(),
  sample_size: z.number().int().nonnegative(),
  context: ContextVector,
});
export type CohortMember = z.infer<typeof CohortMember>;

export const FindSimilarCampaignsData = z.object({
  cohort_id: Uuid,
  members: z.array(CohortMember),
  weighting: z.object({
    similarity: z.string(),
    recency: z.string(),
    sample: z.string(),
    quality: z.string(),
  }),
});
export type FindSimilarCampaignsData = z.infer<typeof FindSimilarCampaignsData>;

// ── compare_with_cohort ─────────────────────────────────────────────────────
export const CompareWithCohortInput = z.object({
  authz: Authz,
  subject: EntityRef,
  cohort_id: Uuid,
  metrics: z.array(z.string()),
});
export type CompareWithCohortInput = z.infer<typeof CompareWithCohortInput>;

export const CohortComparison = z.object({
  metric: z.string(),
  subject_value: z.number(),
  cohort: z.object({
    p10: z.number(),
    p50: z.number(),
    p90: z.number(),
    weighted_mean: z.number(),
  }),
  percentile: z.number().min(0).max(1),
  assessment: z.enum(["within_expected", "underperforming", "outperforming"]),
});
export type CohortComparison = z.infer<typeof CohortComparison>;

export const CompareWithCohortData = z.object({
  comparisons: z.array(CohortComparison),
  cohort_size: z.number().int().nonnegative(),
  effective_sample: z.number().nonnegative(),
});
export type CompareWithCohortData = z.infer<typeof CompareWithCohortData>;
