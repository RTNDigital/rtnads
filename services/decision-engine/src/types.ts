import type { EntityRef, DateWindow } from "@rtnads/contracts";

/**
 * Decision Engine inputs (docs/07 §Decision Engine, docs/11 §6a).
 *
 * The engine consumes a structural EvidenceBundle — deterministic outputs mapped
 * from the Analytics and Benchmark engines — and emits candidate recommendation
 * drafts. It depends only on these plain shapes (not on the other engines), so the
 * layering stays clean.
 */

export type Assessment =
  | "within_expected"
  | "underperforming"
  | "outperforming";

/** Benchmark of the subject's PRIMARY business metric against its cohort. */
export interface BenchmarkSignal {
  cohort_id: string;
  metric: string;
  subject_value: number;
  /** Influence-weighted percentile, or null when the cohort is insufficient. */
  percentile: number | null;
  assessment: Assessment;
  cohort_size: number;
  effective_sample: number;
  cohort_p50: number | null;
  lower_is_better: boolean;
  /** Average recency weight of the cohort in [0,1] (recent = high). */
  recency: number;
}

export interface AnomalySignal {
  metric: string;
  kind: "spike" | "drop";
  severity: "low" | "med" | "high";
  z: number;
  date: string;
}

export interface EvidenceBundle {
  entity: EntityRef;
  window: DateWindow;
  primary: BenchmarkSignal;
  anomalies: AnomalySignal[];
  /** Subject sample size for the primary metric (e.g. qualified leads). */
  subject_sample: number;
  /** Deterministic metrics to attach as supporting evidence. */
  supporting_metrics: Record<string, unknown>;
}

export interface DecisionConfig {
  /** Minimum cohort size before any recommendation is made (else: observe). */
  minCohortSize: number;
  /** Default budget reallocation / change fraction proposed. */
  defaultChangeFraction: number;
  /** Default observation period (ISO-8601 duration). */
  observationPeriod: string;
}

export const DEFAULT_DECISION_CONFIG: DecisionConfig = {
  minCohortSize: 3,
  defaultChangeFraction: 0.2,
  observationPeriod: "P14D",
};
