import { describe, it, expect } from "vitest";
import {
  computeTotals,
  computeDerived,
  computeFunnel,
  computeUnitEconomics,
} from "./compute.js";
import { AnalyticsEngine, DEFAULT_ASSUMPTIONS } from "./engine.js";
import { InMemoryAnalyticsRepository } from "./memory-repo.js";
import type { AnalyticsInputs, FactAggregate, StageDef } from "./types.js";
import { UnitEconomics, FunnelResult, MetricTotals } from "@rtnads/contracts";

// Health Tourism worked example (docs/11). Round numbers → stable golden asserts.
const FACTS: FactAggregate = {
  currency: "GBP",
  spend_minor: 360000, // £3,600.00
  impressions: 200000,
  clicks: 5000,
  conversions: 100,
  conversion_value_minor: 0,
};

const HT_STAGES: StageDef[] = [
  { key: "lead", label: "Lead", ordinal: 1 },
  { key: "contacted", label: "Contacted", ordinal: 2 },
  { key: "qualified", label: "Qualified", ordinal: 3 },
  { key: "commercial_opportunity", label: "Commercial Opportunity", ordinal: 4 },
  { key: "booking", label: "Booking", ordinal: 5 },
  { key: "sale", label: "Sale", ordinal: 6 },
];

const COUNTS = {
  lead: 100,
  contacted: 80,
  qualified: 40,
  commercial_opportunity: 20,
  booking: 12,
  sale: 8,
};

describe("computeTotals", () => {
  it("wraps money in minor units", () => {
    const t = computeTotals(FACTS);
    expect(MetricTotals.parse(t)).toBeTruthy();
    expect(t.spend).toEqual({ amount_minor: 360000, currency: "GBP" });
    expect(t.conversions).toBe(100);
  });
});

describe("computeDerived", () => {
  it("computes ratios; roas is 0 when no platform conversion value", () => {
    const d = computeDerived(FACTS);
    expect(d.ctr).toBeCloseTo(0.025);
    expect(d.cpc).toEqual({ amount_minor: 72, currency: "GBP" });
    expect(d.cpl).toEqual({ amount_minor: 3600, currency: "GBP" });
    expect(d.roas).toBe(0);
  });

  it("returns null (not Infinity) when denominators are zero", () => {
    const d = computeDerived({
      currency: "GBP",
      spend_minor: 1000,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversion_value_minor: 0,
    });
    expect(d.ctr).toBeNull();
    expect(d.cpc).toBeNull();
    expect(d.cpl).toBeNull();
  });
});

describe("computeFunnel", () => {
  it("computes counts, stage rates and overall rate", () => {
    const f = computeFunnel(HT_STAGES, COUNTS);
    expect(FunnelResult.parse(f)).toBeTruthy();
    expect(f.stages.map((s) => s.count)).toEqual([100, 80, 40, 20, 12, 8]);
    expect(f.stages[0]?.rate_from_prev).toBeNull(); // first stage
    expect(f.stages[1]?.rate_from_prev).toBeCloseTo(0.8); // contacted/lead
    expect(f.stages[2]?.rate_from_prev).toBeCloseTo(0.5); // qualified/contacted
    expect(f.overall_rate).toBeCloseTo(0.08); // sale/lead
  });

  it("orders by ordinal regardless of input order", () => {
    const shuffled = [...HT_STAGES].reverse();
    const f = computeFunnel(shuffled, COUNTS);
    expect(f.stages.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("computeUnitEconomics (Health Tourism)", () => {
  const ue = computeUnitEconomics(
    FACTS,
    COUNTS,
    { count: 8, revenue_minor: 1600000, margin_minor: null, currency: "GBP" },
    "health_tourism",
    DEFAULT_ASSUMPTIONS,
  );

  it("is contract-valid", () => {
    expect(UnitEconomics.parse(ue)).toBeTruthy();
  });

  it("computes the full funnel economics, not just CPL", () => {
    expect(ue.cpl).toEqual({ amount_minor: 3600, currency: "GBP" }); // £36
    expect(ue.cost_per_qualified_lead).toEqual({ amount_minor: 9000, currency: "GBP" }); // £90
    expect(ue.cost_per_booking).toEqual({ amount_minor: 30000, currency: "GBP" }); // £300
    expect(ue.cac).toEqual({ amount_minor: 45000, currency: "GBP" }); // £450
    expect(ue.revenue_per_lead).toEqual({ amount_minor: 16000, currency: "GBP" }); // £160
    expect(ue.roas).toBeCloseTo(4.4444, 3);
    // margin_rate 0.4 → 640,000 margin − 360,000 spend = 280,000 (£2,800)
    expect(ue.contribution_margin).toEqual({ amount_minor: 280000, currency: "GBP" });
  });

  it("returns null money when a denominator is zero (no fabricated values)", () => {
    const empty = computeUnitEconomics(
      { currency: "GBP", spend_minor: 5000, impressions: 0, clicks: 0, conversions: 0, conversion_value_minor: 0 },
      {},
      { count: 0, revenue_minor: 0, margin_minor: null, currency: "GBP" },
      "health_tourism",
      DEFAULT_ASSUMPTIONS,
    );
    expect(empty.cpl).toBeNull();
    expect(empty.cost_per_qualified_lead).toBeNull();
    expect(empty.cac).toBeNull();
    // revenue is 0 over positive spend → roas is genuinely 0, not fabricated.
    expect(empty.roas).toBe(0);
  });
});

describe("AnalyticsEngine (via in-memory repo)", () => {
  const inputs: AnalyticsInputs = {
    entity: { type: "campaign", id: "camp-1" },
    window: { start: "2026-07-01", end: "2026-07-31" },
    facts: FACTS,
    stages: HT_STAGES,
    funnel: COUNTS,
    sales: { count: 8, revenue_minor: 1600000, margin_minor: null, currency: "GBP" },
    model: "health_tourism",
  };
  const repo = new InMemoryAnalyticsRepository(new Map([["camp-1", inputs]]));
  const engine = new AnalyticsEngine(repo);

  it("produces a full, contract-valid snapshot", async () => {
    const a = await engine.analyze(
      "client-1",
      { type: "campaign", id: "camp-1" },
      { start: "2026-07-01", end: "2026-07-31" },
      "health_tourism",
    );
    expect(a.totals.spend.amount_minor).toBe(360000);
    expect(a.unit_economics.cost_per_qualified_lead?.amount_minor).toBe(9000);
    expect(a.funnel.overall_rate).toBeCloseTo(0.08);
  });

  it("is deterministic: same inputs → identical output", async () => {
    const a1 = await engine.analyze("client-1", { type: "campaign", id: "camp-1" }, { start: "2026-07-01", end: "2026-07-31" }, "health_tourism");
    const a2 = await engine.analyze("client-1", { type: "campaign", id: "camp-1" }, { start: "2026-07-01", end: "2026-07-31" }, "health_tourism");
    expect(a2).toEqual(a1);
  });
});
