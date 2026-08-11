import { describe, it, expect } from "vitest";
import {
  Money,
  EntityRef,
  responseEnvelope,
  Recommendation,
} from "./index.js";
import { z } from "zod";

describe("common contracts", () => {
  it("accepts valid money in minor units", () => {
    expect(Money.parse({ amount_minor: 4210, currency: "GBP" })).toEqual({
      amount_minor: 4210,
      currency: "GBP",
    });
  });

  it("rejects non-integer minor units", () => {
    expect(() => Money.parse({ amount_minor: 42.1, currency: "GBP" })).toThrow();
  });

  it("rejects a bad currency length", () => {
    expect(() =>
      Money.parse({ amount_minor: 100, currency: "POUND" }),
    ).toThrow();
  });

  it("validates an entity ref", () => {
    const ref = {
      type: "campaign" as const,
      id: "11111111-1111-1111-1111-111111111111",
    };
    expect(EntityRef.parse(ref)).toEqual(ref);
  });
});

describe("response envelope", () => {
  const env = responseEnvelope(z.object({ value: z.number() }));

  it("accepts an ok response", () => {
    const ok = env.parse({
      ok: true,
      data: { value: 1 },
      meta: {
        computed_at: "2026-08-07T10:00:00.000Z",
        provenance: "analytics-engine@1.0.0",
      },
    });
    expect(ok.ok).toBe(true);
  });

  it("accepts an error response", () => {
    const err = env.parse({
      ok: false,
      error: { code: "NOT_FOUND", message: "no such entity", retriable: false },
    });
    expect(err.ok).toBe(false);
  });
});

describe("recommendation contract", () => {
  it("defaults the causation note (evidence, not proof)", () => {
    const rec = Recommendation.parse({
      id: "22222222-2222-2222-2222-222222222222",
      client_id: "33333333-3333-3333-3333-333333333333",
      recommendation_type: "reallocate",
      entity: { type: "ad_set", id: "44444444-4444-4444-4444-444444444444" },
      recommended_action: { shift_percent: 0.2 },
      reasoning: "Qualified-lead economics lag the cohort.",
      supporting_metrics: { cost_per_qualified_lead_minor: 18000 },
      benchmark_comparison: {
        cohort_id: "55555555-5555-5555-5555-555555555555",
        metric: "cost_per_qualified_lead",
        percentile: 0.82,
        assessment: "underperforming",
      },
      confidence_score: 0.62,
      confidence_detail: {
        evidence_strength: 0.7,
        sample_adequacy: 0.6,
        causal_support: "weak",
        recency: 0.9,
      },
      risk_level: "medium",
      expected_outcome: {
        metric: "cost_per_qualified_lead",
        direction: "decrease",
        magnitude_range: [0.1, 0.25],
        basis: "cohort_evidence",
      },
      evidence_window: { start: "2026-07-01", end: "2026-07-14" },
      recommended_observation_period: "P14D",
      model_provenance: { provider: "x", model: "y", version: "1" },
      created_at: "2026-08-07T10:00:00.000Z",
    });
    expect(rec.causation_note).toMatch(/evidence, not proof/);
    expect(rec.status).toBe("draft");
  });
});
