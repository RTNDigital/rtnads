import { describe, it, expect } from "vitest";
import { ScriptedLlmProvider } from "@rtnads/llm-core";
import { Recommendation, type RecommendationDraft } from "@rtnads/contracts";
import {
  AiOrchestrator,
  NarrativeValidationError,
  buildEvidenceText,
} from "./orchestrator.js";
import { extractNumbers, ungroundedNumbers } from "./numeric-guard.js";

const DRAFT: RecommendationDraft = {
  recommendation_type: "reallocate",
  entity: { type: "campaign", id: "22222222-2222-2222-2222-222222222222" },
  recommended_action: { action: "reallocate", shift_fraction: 0.2, direction: "away_from_entity" },
  supporting_metrics: { cost_per_qualified_lead_minor: 18000 },
  benchmark_comparison: {
    cohort_id: "33333333-3333-3333-3333-333333333333",
    metric: "cost_per_qualified_lead",
    percentile: 0.82,
    assessment: "underperforming",
  },
  confidence_score: 0.62,
  confidence_detail: { evidence_strength: 0.7, sample_adequacy: 0.6, causal_support: "weak", recency: 0.9 },
  risk_level: "medium",
  expected_outcome: { metric: "cost_per_qualified_lead", direction: "decrease", magnitude_range: [0.1, 0.25], basis: "cohort_evidence" },
  evidence_window: { start: "2026-07-01", end: "2026-07-31" },
  recommended_observation_period: "P14D",
  causation_note: "Historical outcomes are evidence, not proof of causation.",
};

function deps(responder: string | ((r: any) => string)) {
  return {
    provider: new ScriptedLlmProvider(responder, { model: "scripted-1", version: "0.0.0" }),
    now: () => "2026-08-08T12:00:00.000Z",
    newId: () => "44444444-4444-4444-4444-444444444444",
  };
}

describe("numeric guard", () => {
  it("extracts normalized numeric tokens", () => {
    expect([...extractNumbers("CPL 1,200.50 at 0.82")]).toEqual(
      expect.arrayContaining(["1200.50", "0.82"]),
    );
  });

  it("flags numbers not grounded in the evidence", () => {
    expect(ungroundedNumbers("expected £99.99 saving", "{\"a\":0.2}")).toEqual(["99.99"]);
    expect(ungroundedNumbers("shift 0.2 of budget", "{\"a\":0.2}")).toEqual([]);
  });
});

describe("AiOrchestrator.authorRecommendation", () => {
  const grounded =
    "This campaign sits at the 0.82 percentile for cost per qualified lead, underperforming its cohort. " +
    "Confidence is 0.62; this is correlational evidence, not proof of causation. " +
    "Recommend a 0.2 reallocation and a P14D observation window.";

  it("assembles a contract-valid, published Recommendation with provenance", async () => {
    const orch = new AiOrchestrator(deps(grounded));
    const rec = await orch.authorRecommendation({
      clientId: "11111111-1111-1111-1111-111111111111",
      draft: DRAFT,
      evidenceText: buildEvidenceText(DRAFT),
    });

    expect(() => Recommendation.parse(rec)).not.toThrow();
    expect(rec.status).toBe("published");
    expect(rec.reasoning).toContain("not proof of causation");
    expect(rec.model_provenance).toEqual({ provider: "scripted", model: "scripted-1", version: "0.0.0" });
    expect(rec.id).toBe("44444444-4444-4444-4444-444444444444");
    // deterministic numbers still come from L3, unchanged by the LLM
    expect(rec.confidence_score).toBe(0.62);
    expect(rec.benchmark_comparison.percentile).toBe(0.82);
  });

  it("rejects a narrative that invents an ungrounded number", async () => {
    const orch = new AiOrchestrator(
      deps("We expect a guaranteed £99.99 reduction in cost per lead."),
    );
    await expect(
      orch.authorRecommendation({
        clientId: "11111111-1111-1111-1111-111111111111",
        draft: DRAFT,
        evidenceText: buildEvidenceText(DRAFT),
      }),
    ).rejects.toBeInstanceOf(NarrativeValidationError);
  });

  it("is model-agnostic: provenance reflects whichever provider was used", async () => {
    const orch = new AiOrchestrator({
      provider: new ScriptedLlmProvider(grounded, { model: "other-llm", version: "9.9" }),
      now: () => "2026-08-08T12:00:00.000Z",
      newId: () => "44444444-4444-4444-4444-444444444444",
    });
    const rec = await orch.authorRecommendation({
      clientId: "11111111-1111-1111-1111-111111111111",
      draft: DRAFT,
      evidenceText: buildEvidenceText(DRAFT),
    });
    expect(rec.model_provenance.model).toBe("other-llm");
  });
});
