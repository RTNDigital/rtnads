import type { ConfidenceDetail } from "@rtnads/contracts";
import { clamp01 } from "@rtnads/domain";
import type { EvidenceBundle } from "./types.js";

/**
 * Deterministic confidence scoring (docs/11 §6a, docs/02 §8). Confidence is a
 * function of evidence strength, sample adequacy, recency and causal support —
 * NOT an LLM judgement. Causal support defaults to "weak" because historical
 * outcomes are evidence, not proof that a past action caused a change.
 */

/** Saturating adequacy: n / (n + k) ∈ [0,1). */
function saturate(n: number, k: number): number {
  const x = Math.max(0, n);
  return x / (x + Math.max(1e-9, k));
}

export function evidenceStrength(ev: EvidenceBundle): number {
  const b = ev.primary;
  if (b.percentile == null || b.cohort_size <= 0) return 0;
  const sizeFactor = clamp01(b.cohort_size / 5); // ≥5 comparable campaigns → full
  const sampleFactor = saturate(b.effective_sample, 500);
  return clamp01(sizeFactor * 0.5 + sampleFactor * 0.5);
}

/**
 * Causal support: weak by default. Nudged to "moderate" only when an independent
 * signal corroborates the benchmark (a high-severity anomaly on the same metric
 * pointing the "bad" way). Never "strong" without an experiment.
 */
export function causalSupport(ev: EvidenceBundle): ConfidenceDetail["causal_support"] {
  const b = ev.primary;
  const corroborating = ev.anomalies.some(
    (a) =>
      a.severity === "high" &&
      // a spike in a cost metric corroborates "underperforming"
      ((b.lower_is_better && a.kind === "spike" && b.assessment === "underperforming") ||
        (!b.lower_is_better && a.kind === "drop" && b.assessment === "underperforming")),
  );
  return corroborating ? "moderate" : "weak";
}

export function scoreConfidence(ev: EvidenceBundle): {
  score: number;
  detail: ConfidenceDetail;
} {
  const strength = evidenceStrength(ev);
  const sampleAdequacy = saturate(ev.subject_sample, 20);
  const recency = clamp01(ev.primary.recency);
  const causal = causalSupport(ev);
  const causalFactor = causal === "moderate" ? 0.7 : 0.4;

  const score = clamp01(
    0.4 * strength + 0.3 * sampleAdequacy + 0.2 * recency + 0.1 * causalFactor,
  );

  return {
    score,
    detail: {
      evidence_strength: strength,
      sample_adequacy: sampleAdequacy,
      causal_support: causal,
      recency,
    },
  };
}
