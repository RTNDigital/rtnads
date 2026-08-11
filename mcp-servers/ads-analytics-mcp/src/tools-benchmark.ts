import { z } from "zod";
import { Authz, EntityRef, DateWindow, ResponseMeta } from "@rtnads/contracts";
import {
  type ToolDef,
  type ToolContext,
  requireCap,
  makeResponseMeta,
  AuthzError,
} from "./tools.js";

/**
 * Read-only cohort & anomaly tools backed by the deterministic Benchmark Engine
 * (docs/05 §A: find_similar_campaigns, compare_with_cohort, detect_anomalies).
 * Thin adapters — all weighting/statistics happen in L3, never here or in the LLM.
 */

/** JSON has no NaN; the engine returns NaN for "insufficient evidence" → null. */
function nn(x: number): number | null {
  return Number.isNaN(x) ? null : x;
}

function requireBenchmark(ctx: ToolContext) {
  if (!ctx.benchmark) {
    throw new AuthzError("benchmark capability not available on this server");
  }
  return ctx.benchmark;
}

const CohortInput = z.object({
  authz: Authz,
  subject: EntityRef,
  metric: z.string(),
  window: DateWindow,
  min_similarity: z.number().min(0).max(1).default(0.5),
});

// ── find_similar_campaigns ──────────────────────────────────────────────────
const CohortMemberOut = z.object({
  campaign: EntityRef,
  similarity: z.number(),
  influence: z.number(),
  age_days: z.number(),
  sample_size: z.number().int(),
});
const FindSimilarOutput = z.object({
  subject: EntityRef,
  cohort_size: z.number().int(),
  members: z.array(CohortMemberOut),
  weighting: z.object({
    half_life_days: z.number(),
    min_similarity: z.number(),
  }),
  meta: ResponseMeta,
});

export const findSimilarCampaigns: ToolDef<
  typeof CohortInput,
  typeof FindSimilarOutput
> = {
  name: "find_similar_campaigns",
  title: "Find similar campaigns",
  description:
    "Build an influence-weighted cohort of historically comparable RTN campaigns (weighted by similarity, recency, sample size and data quality).",
  inputSchema: CohortInput,
  outputSchema: FindSimilarOutput,
  async handle(ctx, input) {
    requireCap(input.authz, "ads.read");
    const engine = requireBenchmark(ctx);
    const r = await engine.buildCohort(
      input.authz.client_id,
      input.subject,
      input.metric,
      input.window,
      { minSimilarity: input.min_similarity },
    );
    return {
      subject: input.subject,
      cohort_size: r.members.length,
      members: r.members.map((m) => ({
        campaign: m.entity,
        similarity: m.similarity,
        influence: m.influence,
        age_days: m.ageDays,
        sample_size: m.sampleSize,
      })),
      weighting: {
        half_life_days: r.weighting.halfLifeDays,
        min_similarity: r.min_similarity,
      },
      meta: makeResponseMeta(ctx, input.window),
    };
  },
};

// ── compare_with_cohort ─────────────────────────────────────────────────────
const CompareOutput = z.object({
  comparison: z.object({
    metric: z.string(),
    subject_value: z.number(),
    cohort: z.object({
      p10: z.number().nullable(),
      p50: z.number().nullable(),
      p90: z.number().nullable(),
      weighted_mean: z.number().nullable(),
    }),
    percentile: z.number().nullable(),
    assessment: z.enum(["within_expected", "underperforming", "outperforming"]),
    cohort_size: z.number().int(),
    effective_sample: z.number(),
  }),
  meta: ResponseMeta,
});

export const compareWithCohortTool: ToolDef<
  typeof CohortInput,
  typeof CompareOutput
> = {
  name: "compare_with_cohort",
  title: "Compare with cohort",
  description:
    "Benchmark a subject metric against its influence-weighted cohort — percentile position and assessment (respecting metric direction).",
  inputSchema: CohortInput,
  outputSchema: CompareOutput,
  async handle(ctx, input) {
    requireCap(input.authz, "ads.read");
    const engine = requireBenchmark(ctx);
    const r = await engine.compareWithCohort(
      input.authz.client_id,
      input.subject,
      input.metric,
      input.window,
      { minSimilarity: input.min_similarity },
    );
    const c = r.comparison;
    return {
      comparison: {
        metric: c.metric,
        subject_value: c.subject_value,
        cohort: {
          p10: nn(c.cohort.p10),
          p50: nn(c.cohort.p50),
          p90: nn(c.cohort.p90),
          weighted_mean: nn(c.cohort.weighted_mean),
        },
        percentile: nn(c.percentile),
        assessment: c.assessment,
        cohort_size: c.cohort_size,
        effective_sample: c.effective_sample,
      },
      meta: makeResponseMeta(ctx, input.window),
    };
  },
};

// ── detect_anomalies ────────────────────────────────────────────────────────
const AnomalyInput = z.object({
  authz: Authz,
  subject: EntityRef,
  metric: z.string(),
  window: DateWindow,
  threshold: z.number().positive().optional(),
});
const AnomalyOutput = z.object({
  subject: EntityRef,
  anomalies: z.array(
    z.object({
      date: z.string(),
      metric: z.string(),
      kind: z.enum(["spike", "drop"]),
      severity: z.enum(["low", "med", "high"]),
      observed: z.number(),
      expected_low: z.number(),
      expected_high: z.number(),
      z: z.number(),
    }),
  ),
  meta: ResponseMeta,
});

export const detectAnomaliesTool: ToolDef<typeof AnomalyInput, typeof AnomalyOutput> = {
  name: "detect_anomalies",
  title: "Detect anomalies",
  description:
    "Flag spikes/drops in a metric series using a robust median/MAD z-score. Returns nothing for series too short or flat to judge.",
  inputSchema: AnomalyInput,
  outputSchema: AnomalyOutput,
  async handle(ctx, input) {
    requireCap(input.authz, "ads.read");
    const engine = requireBenchmark(ctx);
    const anomalies = await engine.detectAnomalies(
      input.authz.client_id,
      input.subject,
      input.metric,
      input.window,
      input.threshold,
    );
    return {
      subject: input.subject,
      anomalies,
      meta: makeResponseMeta(ctx, input.window),
    };
  },
};

export const BENCHMARK_TOOLS = [
  findSimilarCampaigns,
  compareWithCohortTool,
  detectAnomaliesTool,
] as const;
