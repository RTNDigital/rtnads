import { describe, it, expect } from "vitest";
import { DecisionEngine } from "./engine.js";
import { generateCandidates } from "./rules.js";
import { scoreConfidence } from "./confidence.js";
import type { EvidenceBundle, BenchmarkSignal } from "./types.js";
import { RecommendationDraft } from "@rtnads/contracts";

const ENTITY = { type: "campaign" as const, id: "22222222-2222-2222-2222-222222222222" };
const WINDOW = { start: "2026-07-01", end: "2026-07-31" };

function signal(overrides: Partial<BenchmarkSignal> = {}): BenchmarkSignal {
  return {
    cohort_id: "33333333-3333-3333-3333-333333333333",
    metric: "cost_per_qualified_lead",
    subject_value: 18000,
    percentile: 0.82,
    assessment: "underperforming",
    cohort_size: 6,
    effective_sample: 800,
    cohort_p50: 12000,
    lower_is_better: true,
    recency: 0.9,
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    entity: ENTITY,
    window: WINDOW,
    primary: signal(),
    anomalies: [],
    subject_sample: 40,
    supporting_metrics: { cost_per_qualified_lead_minor: 18000 },
    ...overrides,
  };
}

describe("confidence scoring", () => {
  it("defaults causal support to weak (evidence, not proof)", () => {
    expect(scoreConfidence(evidence()).detail.causal_support).toBe("weak");
  });

  it("nudges to moderate when a high-severity cost spike corroborates", () => {
    const ev = evidence({
      anomalies: [{ metric: "cost_per_qualified_lead", kind: "spike", severity: "high", z: 4.2, date: "2026-07-20" }],
    });
    expect(scoreConfidence(ev).detail.causal_support).toBe("moderate");
  });

  it("is monotonic in sample size", () => {
    const low = scoreConfidence(evidence({ subject_sample: 2 })).score;
    const high = scoreConfidence(evidence({ subject_sample: 200 })).score;
    expect(high).toBeGreaterThan(low);
  });

  it("all confidence components are bounded in [0,1]", () => {
    const d = scoreConfidence(evidence()).detail;
    for (const v of [d.evidence_strength, d.sample_adequacy, d.recency]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("candidate generation", () => {
  it("recommends nothing when the cohort is insufficient (observe)", () => {
    expect(generateCandidates(evidence({ primary: signal({ cohort_size: 1 }) }))).toEqual([]);
    expect(generateCandidates(evidence({ primary: signal({ percentile: null }) }))).toEqual([]);
  });

  it("recommends nothing when performance is within expectations", () => {
    expect(
      generateCandidates(evidence({ primary: signal({ assessment: "within_expected", percentile: 0.5 }) })),
    ).toEqual([]);
  });

  it("proposes reallocation when underperforming on a cost metric", () => {
    const [d, ...rest] = generateCandidates(evidence());
    expect(rest).toHaveLength(0);
    expect(d).toBeDefined();
    expect(RecommendationDraft.parse(d)).toBeTruthy();
    expect(d!.recommendation_type).toBe("reallocate");
    expect(d!.expected_outcome.direction).toBe("decrease");
    expect(d!.causation_note).toMatch(/evidence, not proof/);
    // draft carries no LLM narrative or provenance
    expect("reasoning" in (d as object)).toBe(false);
    expect("model_provenance" in (d as object)).toBe(false);
  });

  it("proposes a budget increase when outperforming on a cost metric", () => {
    const drafts = generateCandidates(
      evidence({ primary: signal({ assessment: "outperforming", percentile: 0.1 }) }),
    );
    expect(drafts.map((d) => d.recommendation_type)).toContain("budget_increase");
  });

  it("prioritizes pausing on a high-severity cost spike (risk high)", () => {
    const ev = evidence({
      anomalies: [{ metric: "cost_per_qualified_lead", kind: "spike", severity: "high", z: 5, date: "2026-07-20" }],
    });
    const drafts = generateCandidates(ev);
    const pause = drafts.find((d) => d.recommendation_type === "pause_adset");
    expect(pause).toBeDefined();
    expect(pause!.risk_level).toBe("high");
  });
});

describe("DecisionEngine", () => {
  it("returns drafts ranked by confidence and is deterministic", () => {
    const engine = new DecisionEngine();
    const a = engine.generate(evidence());
    const b = engine.generate(evidence());
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) {
      expect(a[i - 1]!.confidence_score).toBeGreaterThanOrEqual(a[i]!.confidence_score);
    }
  });
});
