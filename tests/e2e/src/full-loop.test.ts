import { describe, it, expect } from "vitest";
import {
  AnalyticsEngine,
  InMemoryAnalyticsRepository,
  type AnalyticsInputs,
} from "@rtnads/analytics-engine";
import {
  BenchmarkEngine,
  InMemoryBenchmarkRepository,
  type BenchmarkDataset,
} from "@rtnads/benchmark-engine";
import { DecisionEngine, type EvidenceBundle } from "@rtnads/decision-engine";
import { AiOrchestrator, buildEvidenceText } from "@rtnads/orchestrator";
import { ScriptedLlmProvider } from "@rtnads/llm-core";
import { PolicyEngine } from "@rtnads/policy-engine";
import {
  ActionExecutor,
  InMemoryAuditLog,
  evaluateOutcome,
  type PlatformConnector,
} from "@rtnads/action-executor";
import {
  Action,
  OptimizationPolicy,
  Recommendation,
  type ProposedChange,
  type PolicyContext,
} from "@rtnads/contracts";

/**
 * The whole MVP optimization loop in one deterministic pass (docs/11):
 * analytics → benchmark → decision → orchestrator (scripted LLM) → policy →
 * human approval → execution → immutable record + hash-chained audit → outcome.
 * No real LLM, no live platform — proving the pieces compose.
 */

const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const ACCOUNT = "aaaaaaaa-0000-0000-0000-0000000000a1";
const CAMPAIGN = { type: "campaign" as const, id: "22222222-2222-2222-2222-222222222222" };
const gbp = (amount_minor: number) => ({ amount_minor, currency: "GBP" });
const CTX = {
  vertical: "health-tourism",
  subcategory: "health-tourism/rhinoplasty",
  market: "uk",
  platform: "meta",
};

function analyticsInputs(): AnalyticsInputs {
  return {
    entity: CAMPAIGN,
    window: { start: "2026-07-01", end: "2026-07-31" },
    facts: { currency: "GBP", spend_minor: 360000, impressions: 200000, clicks: 5000, conversions: 100, conversion_value_minor: 0 },
    stages: [
      { key: "lead", label: "Lead", ordinal: 1 },
      { key: "qualified", label: "Qualified", ordinal: 3 },
      { key: "sale", label: "Sale", ordinal: 6 },
    ],
    funnel: { lead: 100, qualified: 40, sale: 8 },
    sales: { count: 8, revenue_minor: 1600000, margin_minor: null, currency: "GBP" },
    model: "health_tourism",
  };
}

function benchmarkDataset(subjectValue: number): BenchmarkDataset {
  const cand = (id: string, v: number) => ({
    entity: { type: "campaign" as const, id },
    context: { ...CTX },
    metricValue: v,
    ageDays: 20,
    sampleSize: 100,
    dataQuality: 0.9,
  });
  return {
    subject: { entity: CAMPAIGN, context: CTX, metricValue: subjectValue },
    candidates: [
      cand("aaaaaaaa-0000-0000-0000-00000000000a", 4500),
      cand("aaaaaaaa-0000-0000-0000-00000000000b", 6000),
      cand("aaaaaaaa-0000-0000-0000-00000000000c", 7500),
    ],
    metric: "cost_per_qualified_lead",
    lowerIsBetter: true,
  };
}

function policy(): OptimizationPolicy {
  return OptimizationPolicy.parse({
    version: 7,
    client_id: CLIENT,
    constraints: {
      budget_change: { max_percent: 0.25, max_absolute: gbp(50000) },
      evidence: { min_days: 7, min_conversions: 20, min_spend: gbp(30000) },
      cooldown: { budget_change_hours: 48, pause_hours: 24 },
      maturity: { min_campaign_state: "stabilizing" },
      automation: { budget_change: "requires_approval", pause: "requires_approval", activate: "requires_approval", experiment: "requires_approval" },
      account_restrictions: { protected_accounts: [], excluded_actions: [] },
      experiment_protection: true,
      daily_spend_limit: gbp(200000),
    },
  });
}

const policyContext: PolicyContext = {
  current_budget_minor: 100000,
  campaign_maturity: "mature",
  evidence_days: 14,
  conversions: 50,
  spend_minor: 100000,
  hours_since_last_change: 100,
  daily_spend_minor: 50000,
  active_experiment: false,
};

const connector: PlatformConnector = {
  async applyMutation() {
    return { platform_response: { ok: true }, post_state: { budget_minor: 80000 } };
  },
  async revert() {
    return { platform_response: { reverted: true } };
  },
};

describe("MVP optimization loop (end-to-end, deterministic)", () => {
  it("carries a subject from analysis to an audited, evaluated action", async () => {
    // 1. ANALYTICS — deterministic unit economics.
    const analytics = new AnalyticsEngine(new InMemoryAnalyticsRepository(new Map([[CAMPAIGN.id, analyticsInputs()]])));
    const a = await analytics.analyze(CLIENT, CAMPAIGN, analyticsInputs().window, "health_tourism");
    const cpqlMinor = a.unit_economics.cost_per_qualified_lead!.amount_minor;
    expect(cpqlMinor).toBe(9000); // £90 per qualified lead

    // 2. BENCHMARK — the subject underperforms its cohort.
    const benchmark = new BenchmarkEngine(new InMemoryBenchmarkRepository(new Map([[CAMPAIGN.id, benchmarkDataset(cpqlMinor)]])));
    const b = await benchmark.compareWithCohort(CLIENT, CAMPAIGN, "cost_per_qualified_lead", analyticsInputs().window);
    expect(b.comparison.assessment).toBe("underperforming");
    expect(b.comparison.cohort_size).toBe(3);

    // 3. DECISION — deterministic candidate draft (no LLM).
    const evidence: EvidenceBundle = {
      entity: CAMPAIGN,
      window: analyticsInputs().window,
      primary: {
        cohort_id: "33333333-3333-3333-3333-333333333333",
        metric: "cost_per_qualified_lead",
        subject_value: b.comparison.subject_value,
        percentile: b.comparison.percentile,
        assessment: b.comparison.assessment,
        cohort_size: b.comparison.cohort_size,
        effective_sample: b.comparison.effective_sample,
        cohort_p50: b.comparison.cohort.p50,
        lower_is_better: true,
        recency: 0.9,
      },
      anomalies: [],
      subject_sample: 40,
      supporting_metrics: { cost_per_qualified_lead_minor: cpqlMinor },
    };
    const [draft] = new DecisionEngine().generate(evidence);
    expect(draft).toBeDefined();
    expect(draft!.recommendation_type).toBe("reallocate");

    // 4. ORCHESTRATOR — narrative over grounded evidence (scripted provider).
    const narrative =
      "This campaign's cost per qualified lead is underperforming its comparable RTN cohort. " +
      "This is correlational evidence, not proof of causation. We recommend reallocating 0.2 of budget " +
      "away from it and observing for a P14D window.";
    const orch = new AiOrchestrator({
      provider: new ScriptedLlmProvider(narrative, { model: "scripted-1", version: "0.0.0" }),
      now: () => "2026-08-08T12:00:00.000Z",
      newId: () => "dddddddd-0000-0000-0000-00000000000d",
    });
    const rec = await orch.authorRecommendation({ clientId: CLIENT, draft: draft!, evidenceText: buildEvidenceText(draft!) });
    expect(() => Recommendation.parse(rec)).not.toThrow();
    expect(rec.status).toBe("published");
    expect(rec.reasoning).toContain("not proof of causation");
    // numbers are unchanged from L3 — the LLM added none
    expect(rec.benchmark_comparison.percentile).toBe(b.comparison.percentile);

    // 5. POLICY — translate the recommendation into a gated change.
    const change: ProposedChange = {
      action_type: "update_budget",
      entity: CAMPAIGN,
      account_id: ACCOUNT,
      budget_change: { type: "percent", value: -0.2 }, // reallocate away → decrease
    };
    const evaluation = new PolicyEngine().evaluate(policy(), change, policyContext);
    expect(evaluation.decision).toBe("needs_approval");

    // 6. APPROVAL (human-in-the-loop) → the action becomes approved.
    const action = Action.parse({
      id: "eeeeeeee-0000-0000-0000-00000000000e",
      client_id: CLIENT,
      recommendation_id: rec.id,
      approval_id: "ffffffff-0000-0000-0000-00000000000f",
      entity: CAMPAIGN,
      account_id: ACCOUNT,
      action_type: "update_budget",
      requested_change: change.budget_change!,
      policy_evaluation: evaluation,
      status: "approved",
      created_at: "2026-08-08T12:05:00.000Z",
    });

    // 7. EXECUTION — immutable record + hash-chained audit.
    const audit = new InMemoryAuditLog();
    const executor = new ActionExecutor({
      connector,
      capturePreState: async () => ({ budget_minor: 100000 }),
      now: () => "2026-08-08T12:06:00.000Z",
      newId: () => "11111111-2222-3333-4444-555555555555",
      auditLog: audit,
    });
    const record = await executor.execute(action);
    expect(record.pre_state).toEqual({ budget_minor: 100000 });
    expect(record.post_state).toEqual({ budget_minor: 80000 });
    expect(Object.isFrozen(record)).toBe(true);
    expect(audit.verify()).toBe(true);
    expect(audit.entries[0]!.action).toBe("action.executed");

    // 8. OUTCOME — conservative, deterministic evaluation after the window.
    const outcome = evaluateOutcome({
      id: "99999999-0000-0000-0000-000000000009",
      action_record_id: record.id,
      metric: "cost_per_qualified_lead",
      before: cpqlMinor, // 9000
      after: 7000,
      lowerIsBetter: true,
      window: { start: "2026-08-08", end: "2026-08-22" },
      evaluated_at: "2026-08-22T00:00:00.000Z",
    });
    expect(outcome.result).toBe("improved");
    expect(outcome.causal_confidence).toBeLessThanOrEqual(0.5); // evidence, not proof
  });

  it("a policy-denied recommendation never reaches execution", async () => {
    const change: ProposedChange = {
      action_type: "update_budget",
      entity: CAMPAIGN,
      account_id: ACCOUNT,
      budget_change: { type: "percent", value: -0.5 }, // exceeds the 0.25 cap
    };
    const evaluation = new PolicyEngine().evaluate(policy(), change, policyContext);
    expect(evaluation.decision).toBe("deny");

    const action = Action.parse({
      id: "eeeeeeee-0000-0000-0000-00000000000e",
      client_id: CLIENT,
      entity: CAMPAIGN,
      account_id: ACCOUNT,
      action_type: "update_budget",
      requested_change: change.budget_change!,
      policy_evaluation: evaluation,
      status: "approved", // even if a human clicked approve, policy deny is final
      created_at: "2026-08-08T12:05:00.000Z",
    });
    const executor = new ActionExecutor({
      connector,
      capturePreState: async () => ({}),
      now: () => "2026-08-08T12:06:00.000Z",
      newId: () => "11111111-2222-3333-4444-555555555555",
    });
    await expect(executor.execute(action)).rejects.toThrow();
  });
});
