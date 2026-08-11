import { describe, it, expect } from "vitest";
import { PolicyEngine } from "./engine.js";
import {
  OptimizationPolicy,
  PolicyEvaluation,
  type ProposedChange,
  type PolicyContext,
  type AutomationTier,
} from "@rtnads/contracts";

const gbp = (amount_minor: number) => ({ amount_minor, currency: "GBP" });
const ACCOUNT = "aaaaaaaa-0000-0000-0000-0000000000a1";
const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const CAMPAIGN = { type: "campaign" as const, id: "22222222-2222-2222-2222-222222222222" };

function policy(over: Partial<OptimizationPolicy["constraints"]> = {}, automation?: Partial<Record<string, AutomationTier>>): OptimizationPolicy {
  return OptimizationPolicy.parse({
    version: 7,
    client_id: CLIENT,
    constraints: {
      budget_change: { max_percent: 0.25, max_absolute: gbp(50000) },
      evidence: { min_days: 7, min_conversions: 20, min_spend: gbp(30000) },
      cooldown: { budget_change_hours: 48, pause_hours: 24 },
      maturity: { min_campaign_state: "stabilizing" },
      automation: { budget_change: "requires_approval", pause: "requires_approval", activate: "requires_approval", experiment: "requires_approval", ...automation },
      account_restrictions: { protected_accounts: [], excluded_actions: [] },
      experiment_protection: true,
      daily_spend_limit: gbp(200000),
      ...over,
    },
  });
}

function ctx(over: Partial<PolicyContext> = {}): PolicyContext {
  return {
    current_budget_minor: 100000,
    campaign_maturity: "mature",
    evidence_days: 14,
    conversions: 50,
    spend_minor: 100000,
    hours_since_last_change: 100,
    daily_spend_minor: 50000,
    active_experiment: false,
    ...over,
  };
}

const budgetIncrease = (value = 0.2): ProposedChange => ({
  action_type: "update_budget",
  entity: CAMPAIGN,
  account_id: ACCOUNT,
  budget_change: { type: "percent", value },
});

const engine = new PolicyEngine();
const codes = (e: PolicyEvaluation) => e.violated_constraints.map((v) => v.code);

describe("Policy Engine decision table", () => {
  it("a valid budget change needs human approval (Phase 2 default)", () => {
    const e = engine.evaluate(policy(), budgetIncrease(), ctx());
    expect(PolicyEvaluation.parse(e)).toBeTruthy();
    expect(e.decision).toBe("needs_approval");
    expect(e.requires_approval).toBe(true);
  });

  it("allows when automation is auto and all constraints pass", () => {
    const e = engine.evaluate(policy({}, { budget_change: "auto" }), budgetIncrease(), ctx());
    expect(e.decision).toBe("allow");
    expect(e.violated_constraints).toEqual([]);
  });

  it("denies when automation is disabled", () => {
    const e = engine.evaluate(policy({}, { budget_change: "disabled" }), budgetIncrease(), ctx());
    expect(e.decision).toBe("deny");
    expect(codes(e)).toContain("AUTOMATION_DISABLED");
  });

  it("denies a budget delta over the percent cap", () => {
    const e = engine.evaluate(policy(), budgetIncrease(0.3), ctx());
    expect(e.decision).toBe("deny");
    expect(codes(e)).toContain("MAX_BUDGET_DELTA_PERCENT");
  });

  it("denies a budget delta over the absolute cap", () => {
    // 0.2 of 300000 = 60000 > 50000 absolute cap (percent 0.2 < 0.25 is fine)
    const e = engine.evaluate(policy(), budgetIncrease(0.2), ctx({ current_budget_minor: 300000 }));
    expect(codes(e)).toContain("MAX_BUDGET_DELTA_ABSOLUTE");
    expect(e.decision).toBe("deny");
  });

  it("denies on insufficient evidence", () => {
    expect(codes(engine.evaluate(policy(), budgetIncrease(), ctx({ conversions: 10 })))).toContain("MIN_CONVERSIONS");
    expect(codes(engine.evaluate(policy(), budgetIncrease(), ctx({ evidence_days: 3 })))).toContain("MIN_EVIDENCE_DAYS");
    expect(codes(engine.evaluate(policy(), budgetIncrease(), ctx({ spend_minor: 1000 })))).toContain("MIN_SPEND");
  });

  it("denies below the maturity floor", () => {
    const e = engine.evaluate(policy(), budgetIncrease(), ctx({ campaign_maturity: "learning" }));
    expect(codes(e)).toContain("MATURITY");
  });

  it("denies within the cooldown window", () => {
    const e = engine.evaluate(policy(), budgetIncrease(), ctx({ hours_since_last_change: 10 }));
    expect(codes(e)).toContain("COOLDOWN");
  });

  it("denies when the increase would exceed the daily spend limit", () => {
    const e = engine.evaluate(policy(), budgetIncrease(), ctx({ daily_spend_minor: 190000 }));
    expect(codes(e)).toContain("DAILY_SPEND_LIMIT");
  });

  it("denies when an active experiment protects the entity", () => {
    const e = engine.evaluate(policy(), budgetIncrease(), ctx({ active_experiment: true }));
    expect(codes(e)).toContain("EXPERIMENT_PROTECTED");
  });

  it("denies an excluded action on a protected account", () => {
    const p = policy({ account_restrictions: { protected_accounts: [ACCOUNT], excluded_actions: ["update_budget"] } });
    const e = engine.evaluate(p, budgetIncrease(), ctx());
    expect(codes(e)).toContain("ACCOUNT_RESTRICTED");
  });

  it("deny takes precedence over needs_approval", () => {
    const e = engine.evaluate(policy(), budgetIncrease(0.3), ctx({ conversions: 1 }));
    expect(e.decision).toBe("deny");
    expect(codes(e)).toEqual(expect.arrayContaining(["MAX_BUDGET_DELTA_PERCENT", "MIN_CONVERSIONS"]));
  });
});

describe("fail-closed & determinism", () => {
  it("denies when no policy is configured", () => {
    const e = engine.evaluate(null, budgetIncrease(), ctx());
    expect(e.decision).toBe("deny");
    expect(codes(e)).toContain("NO_POLICY");
  });

  it("is deterministic", () => {
    const a = engine.evaluate(policy(), budgetIncrease(), ctx());
    const b = engine.evaluate(policy(), budgetIncrease(), ctx());
    expect(b).toEqual(a);
  });

  it("pause with insufficient evidence is denied; otherwise needs approval", () => {
    const pause: ProposedChange = { action_type: "pause_adset", entity: CAMPAIGN, account_id: ACCOUNT };
    expect(engine.evaluate(policy(), pause, ctx()).decision).toBe("needs_approval");
    expect(codes(engine.evaluate(policy(), pause, ctx({ conversions: 0 })))).toContain("MIN_CONVERSIONS");
  });
});
