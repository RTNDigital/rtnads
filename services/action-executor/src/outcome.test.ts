import { describe, it, expect } from "vitest";
import { evaluateOutcome, type OutcomeInput } from "./outcome.js";
import { OutcomeEvaluation } from "@rtnads/contracts";

const base: OutcomeInput = {
  id: "66666666-6666-6666-6666-666666666666",
  action_record_id: "55555555-5555-5555-5555-555555555551",
  metric: "cost_per_qualified_lead",
  before: 18000,
  after: 15000,
  lowerIsBetter: true,
  window: { start: "2026-07-15", end: "2026-07-29" },
  evaluated_at: "2026-07-29T00:00:00.000Z",
};

describe("evaluateOutcome", () => {
  it("classifies a cost reduction as improved (contract-valid)", () => {
    const o = evaluateOutcome(base);
    expect(OutcomeEvaluation.parse(o)).toBeTruthy();
    expect(o.result).toBe("improved");
    expect(o.delta.cost_per_qualified_lead).toBe(-3000);
  });

  it("classifies a cost increase as regressed", () => {
    expect(evaluateOutcome({ ...base, after: 22000 }).result).toBe("regressed");
  });

  it("treats a small change as neutral", () => {
    expect(evaluateOutcome({ ...base, after: 18200 }).result).toBe("neutral");
  });

  it("respects metric direction (ROAS higher is better)", () => {
    const o = evaluateOutcome({ ...base, metric: "roas", before: 3, after: 4, lowerIsBetter: false });
    expect(o.result).toBe("improved");
  });

  it("keeps causal confidence conservative (never strong)", () => {
    for (const after of [1, 9000, 30000, 100000]) {
      const o = evaluateOutcome({ ...base, after });
      expect(o.causal_confidence).toBeLessThanOrEqual(0.5);
    }
  });
});
