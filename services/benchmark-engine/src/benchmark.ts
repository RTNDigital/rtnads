import type { ScoredMember } from "./cohort.js";

/**
 * Deterministic, influence-weighted benchmarking (docs/02 §5, docs/05
 * compare_with_cohort). Cohort observations count according to their influence,
 * so a recent, similar, high-sample campaign moves the benchmark more than a
 * stale, marginal one.
 */

export interface CohortDistribution {
  p10: number;
  p50: number;
  p90: number;
  weighted_mean: number;
}

export type Assessment =
  | "within_expected"
  | "underperforming"
  | "outperforming";

export interface CohortComparison {
  metric: string;
  subject_value: number;
  cohort: CohortDistribution;
  percentile: number; // influence-weighted fraction of cohort below the subject
  assessment: Assessment;
  cohort_size: number;
  effective_sample: number; // sum of member sample sizes
}

/** Influence-weighted quantile of `values` at q ∈ [0,1] (linear on cumulative weight). */
export function weightedQuantile(
  values: number[],
  weights: number[],
  q: number,
): number {
  const pairs = values
    .map((v, i) => ({ v, w: Math.max(0, weights[i] ?? 0) }))
    .filter((p) => p.w > 0)
    .sort((a, b) => a.v - b.v);
  const total = pairs.reduce((s, p) => s + p.w, 0);
  if (pairs.length === 0 || total <= 0) return NaN;
  const target = q * total;
  let cum = 0;
  for (const p of pairs) {
    cum += p.w;
    if (cum >= target) return p.v;
  }
  return pairs[pairs.length - 1]!.v;
}

export function weightedMean(values: number[], weights: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    const w = Math.max(0, weights[i] ?? 0);
    num += w * (values[i] ?? 0);
    den += w;
  }
  return den > 0 ? num / den : NaN;
}

/** Influence-weighted fraction of the cohort strictly below the subject value. */
export function weightedPercentileOf(
  subjectValue: number,
  values: number[],
  weights: number[],
): number {
  let below = 0;
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const w = Math.max(0, weights[i] ?? 0);
    total += w;
    if ((values[i] ?? 0) < subjectValue) below += w;
  }
  return total > 0 ? below / total : NaN;
}

/**
 * Classify the subject's standing. For cost metrics (lowerIsBetter) a HIGH
 * percentile means the subject costs more than most of the cohort → underperforming.
 */
export function assess(percentile: number, lowerIsBetter: boolean): Assessment {
  const low = 0.25;
  const high = 0.75;
  if (Number.isNaN(percentile)) return "within_expected";
  if (lowerIsBetter) {
    if (percentile >= high) return "underperforming";
    if (percentile <= low) return "outperforming";
  } else {
    if (percentile >= high) return "outperforming";
    if (percentile <= low) return "underperforming";
  }
  return "within_expected";
}

/**
 * Compare a subject value against an influence-weighted cohort. Returns a
 * conservative "insufficient evidence" shape (empty distribution, NaN percentile)
 * when the cohort is empty — never a fabricated benchmark (docs/00 §3).
 */
export function compareWithCohort(
  metric: string,
  subjectValue: number,
  members: ScoredMember[],
  lowerIsBetter: boolean,
): CohortComparison {
  const values = members.map((m) => m.metricValue);
  const weights = members.map((m) => m.influence);
  const percentile = weightedPercentileOf(subjectValue, values, weights);
  return {
    metric,
    subject_value: subjectValue,
    cohort: {
      p10: weightedQuantile(values, weights, 0.1),
      p50: weightedQuantile(values, weights, 0.5),
      p90: weightedQuantile(values, weights, 0.9),
      weighted_mean: weightedMean(values, weights),
    },
    percentile,
    assessment: assess(percentile, lowerIsBetter),
    cohort_size: members.length,
    effective_sample: members.reduce((s, m) => s + m.sampleSize, 0),
  };
}
