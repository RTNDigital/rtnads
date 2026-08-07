import { z } from "zod";
import { Uuid, EntityRef, DateWindow } from "./common.js";

/**
 * The canonical Recommendation object (docs/02-domain-model.md §8,
 * docs/05-mcp-tool-contracts.md §E). Numbers in supporting_metrics /
 * benchmark_comparison / confidence_score originate deterministically (L3);
 * the LLM authors only `reasoning`.
 */

export const RecommendationType = z.enum([
  "budget_increase",
  "budget_decrease",
  "reallocate",
  "pause_ad",
  "pause_adset",
  "pause_campaign",
  "activate",
  "creative_refresh",
  "create_experiment",
]);
export type RecommendationType = z.infer<typeof RecommendationType>;

export const RiskLevel = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const CausalSupport = z.enum(["weak", "moderate", "strong"]);
export type CausalSupport = z.infer<typeof CausalSupport>;

export const BenchmarkComparison = z.object({
  cohort_id: Uuid,
  metric: z.string(),
  percentile: z.number().min(0).max(1),
  assessment: z.enum(["within_expected", "underperforming", "outperforming"]),
});
export type BenchmarkComparison = z.infer<typeof BenchmarkComparison>;

export const ConfidenceDetail = z.object({
  evidence_strength: z.number().min(0).max(1),
  sample_adequacy: z.number().min(0).max(1),
  causal_support: CausalSupport,
  recency: z.number().min(0).max(1),
});
export type ConfidenceDetail = z.infer<typeof ConfidenceDetail>;

export const ExpectedOutcome = z.object({
  metric: z.string(),
  direction: z.enum(["increase", "decrease", "hold"]),
  magnitude_range: z.tuple([z.number(), z.number()]),
  basis: z.string(), // e.g. "cohort_evidence"
});
export type ExpectedOutcome = z.infer<typeof ExpectedOutcome>;

export const ModelProvenance = z.object({
  provider: z.string(),
  model: z.string(),
  version: z.string(),
});
export type ModelProvenance = z.infer<typeof ModelProvenance>;

export const Recommendation = z.object({
  id: Uuid,
  client_id: Uuid,
  recommendation_type: RecommendationType,
  entity: EntityRef,
  /** Concrete, executable parameters for an Actions MCP tool. */
  recommended_action: z.record(z.string(), z.unknown()),
  /** AI narrative, grounded strictly in the supplied evidence. */
  reasoning: z.string(),
  /** Deterministic, copied from Analytics MCP. */
  supporting_metrics: z.record(z.string(), z.unknown()),
  benchmark_comparison: BenchmarkComparison,
  confidence_score: z.number().min(0).max(1),
  confidence_detail: ConfidenceDetail,
  risk_level: RiskLevel,
  expected_outcome: ExpectedOutcome,
  evidence_window: DateWindow,
  /** ISO-8601 duration, e.g. "P14D". */
  recommended_observation_period: z.string(),
  causation_note: z
    .string()
    .default(
      "Historical outcomes are evidence, not proof of causation.",
    ),
  model_provenance: ModelProvenance,
  status: z
    .enum(["draft", "published", "approved", "rejected", "executed"])
    .default("draft"),
  created_at: z.string().datetime(),
});
export type Recommendation = z.infer<typeof Recommendation>;
