import type { EntityRef } from "@rtnads/contracts";

/**
 * Inputs and ports for the Benchmark Engine (docs/02 §5, docs/03 §intel). Like
 * the Analytics Engine, the math is pure; a repository supplies the dataset. The
 * subject is compared against a weighted cohort of historically similar RTN
 * campaigns — context, not category, drives comparability.
 */

/** How a single context dimension contributes to similarity. */
export interface DimensionSpec {
  key: string;
  /** Non-negative weight (normalized internally). Configurable per vertical. */
  weight: number;
  type: "exact" | "taxonomy" | "range";
  /** For range dimensions: value → ordinal, and the bucket span (n-1). */
  ordinals?: Record<string, number>;
  span?: number;
}

/** Observation-weighting knobs (docs/02 §5). */
export interface WeightingParams {
  halfLifeDays: number;
  sampleK?: number;
}

export const DEFAULT_WEIGHTING: WeightingParams = { halfLifeDays: 180, sampleK: 20 };

/** A historical campaign considered for the cohort. */
export interface CohortCandidate {
  entity: EntityRef;
  context: Record<string, string>;
  /** The metric being benchmarked (e.g. cost-per-qualified-lead, minor units). */
  metricValue: number;
  ageDays: number;
  sampleSize: number;
  dataQuality: number; // 0..1
}

export interface DateWindow {
  start: string;
  end: string;
}

/** The subject under evaluation. */
export interface BenchmarkSubject {
  entity: EntityRef;
  context: Record<string, string>;
  metricValue: number;
  /** Optional daily series of the metric, for anomaly detection. */
  series?: { date: string; value: number }[];
}

/** Everything needed to benchmark one subject on one metric. */
export interface BenchmarkDataset {
  subject: BenchmarkSubject;
  candidates: CohortCandidate[];
  metric: string;
  /** True for cost metrics (CPL, CAC); false for ROAS/revenue. */
  lowerIsBetter: boolean;
}

export interface BenchmarkRepository {
  load(
    clientId: string,
    entity: EntityRef,
    metric: string,
    window: DateWindow,
  ): Promise<BenchmarkDataset>;
}
