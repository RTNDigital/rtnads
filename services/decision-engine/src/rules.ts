import type { RecommendationDraft } from "@rtnads/contracts";
import type { EvidenceBundle, DecisionConfig, AnomalySignal } from "./types.js";
import { DEFAULT_DECISION_CONFIG } from "./types.js";
import { scoreConfidence } from "./confidence.js";

/**
 * Deterministic candidate-generation rules (docs/11 §6a). Given an evidence
 * bundle, produce zero or more recommendation DRAFTS. No LLM, no narrative, no
 * fabricated numbers: when evidence is insufficient the engine recommends
 * nothing (observe), upholding "evidence, not proof".
 */

function relativeGap(subject: number, p50: number | null): number {
  if (p50 == null || subject <= 0) return 0;
  return Math.abs(subject - p50) / subject;
}

function riskFor(
  type: RecommendationDraft["recommendation_type"],
  confidence: number,
): RecommendationDraft["risk_level"] {
  if (type === "pause_adset" || type === "pause_campaign") return "high";
  if (confidence < 0.4) return "high";
  if (confidence >= 0.7) return "low";
  return "medium";
}

function highSeverityCostAnomaly(ev: EvidenceBundle): AnomalySignal | undefined {
  return ev.anomalies.find(
    (a) => a.severity === "high" && a.kind === "spike" && ev.primary.lower_is_better,
  );
}

export function generateCandidates(
  ev: EvidenceBundle,
  config: DecisionConfig = DEFAULT_DECISION_CONFIG,
): RecommendationDraft[] {
  const b = ev.primary;

  // Insufficient evidence → observe, never fabricate a recommendation.
  if (b.percentile == null || b.cohort_size < config.minCohortSize) return [];

  const { score, detail } = scoreConfidence(ev);
  const gap = relativeGap(b.subject_value, b.cohort_p50);
  const drafts: RecommendationDraft[] = [];

  const comparison = {
    cohort_id: b.cohort_id,
    metric: b.metric,
    percentile: b.percentile,
    assessment: b.assessment,
  };
  const base = {
    entity: ev.entity,
    supporting_metrics: ev.supporting_metrics,
    benchmark_comparison: comparison,
    confidence_score: score,
    confidence_detail: detail,
    evidence_window: ev.window,
    recommended_observation_period: config.observationPeriod,
    causation_note: "Historical outcomes are evidence, not proof of causation.",
  } as const;

  // 1. Safety-first: a clear cost spike → propose pausing the ad set to investigate.
  const spike = highSeverityCostAnomaly(ev);
  if (spike) {
    drafts.push({
      ...base,
      recommendation_type: "pause_adset",
      recommended_action: { action: "pause_adset", reason: "cost anomaly", anomaly_date: spike.date },
      risk_level: riskFor("pause_adset", score),
      expected_outcome: {
        metric: b.metric,
        direction: "decrease",
        magnitude_range: [0.1, 0.3],
        basis: "anomaly_signal",
      },
    });
  }

  // 2. Underperforming on a cost metric → reallocate budget away from this entity.
  if (b.assessment === "underperforming" && b.lower_is_better) {
    drafts.push({
      ...base,
      recommendation_type: "reallocate",
      recommended_action: {
        action: "reallocate",
        shift_fraction: config.defaultChangeFraction,
        direction: "away_from_entity",
      },
      risk_level: riskFor("reallocate", score),
      expected_outcome: {
        metric: b.metric,
        direction: "decrease",
        magnitude_range: [Math.min(0.1, gap), Math.min(0.4, gap)],
        basis: "cohort_evidence",
      },
    });
  }

  // 3. Outperforming on a cost metric → scale up (budget increase).
  if (b.assessment === "outperforming" && b.lower_is_better) {
    drafts.push({
      ...base,
      recommendation_type: "budget_increase",
      recommended_action: {
        action: "update_budget",
        change: { type: "percent", value: config.defaultChangeFraction },
      },
      risk_level: riskFor("budget_increase", score),
      expected_outcome: {
        metric: b.metric,
        direction: "hold",
        magnitude_range: [0, 0.1],
        basis: "cohort_evidence",
      },
    });
  }

  return drafts;
}
