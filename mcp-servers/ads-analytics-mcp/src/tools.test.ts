import { describe, it, expect } from "vitest";
import {
  AnalyticsEngine,
  InMemoryAnalyticsRepository,
  type AnalyticsInputs,
} from "@rtnads/analytics-engine";
import {
  calculateUnitEconomics,
  getEntityMetrics,
  getSalesPerformance,
  AuthzError,
  type ToolContext,
} from "./tools.js";

// Health Tourism worked example (same numbers as the engine's golden tests).
const INPUTS: AnalyticsInputs = {
  entity: { type: "campaign", id: "22222222-2222-2222-2222-222222222222" },
  window: { start: "2026-07-01", end: "2026-07-31" },
  facts: {
    currency: "GBP",
    spend_minor: 360000,
    impressions: 200000,
    clicks: 5000,
    conversions: 100,
    conversion_value_minor: 0,
  },
  stages: [
    { key: "lead", label: "Lead", ordinal: 1 },
    { key: "contacted", label: "Contacted", ordinal: 2 },
    { key: "qualified", label: "Qualified", ordinal: 3 },
    { key: "booking", label: "Booking", ordinal: 5 },
    { key: "sale", label: "Sale", ordinal: 6 },
  ],
  funnel: { lead: 100, contacted: 80, qualified: 40, booking: 12, sale: 8 },
  sales: { count: 8, revenue_minor: 1600000, margin_minor: null, currency: "GBP" },
  model: "health_tourism",
};

function makeCtx(): ToolContext {
  const repo = new InMemoryAnalyticsRepository(new Map([["22222222-2222-2222-2222-222222222222", INPUTS]]));
  return {
    engine: new AnalyticsEngine(repo),
    now: () => "2026-08-08T00:00:00.000Z",
  };
}

const AUTHZ = {
  client_id: "11111111-1111-1111-1111-111111111111",
  principal: "user:11111111-1111-1111-1111-111111111111",
  capabilities: ["ads.read"],
};
const ENTITY = { type: "campaign" as const, id: "22222222-2222-2222-2222-222222222222" };
const WINDOW = { start: "2026-07-01", end: "2026-07-31" };
const base = { authz: AUTHZ, entity: ENTITY, window: WINDOW, model: "health_tourism" as const };

describe("calculate_unit_economics", () => {
  it("returns contract-valid, business-specific unit economics", async () => {
    const out = await calculateUnitEconomics.handle(makeCtx(), base);
    expect(calculateUnitEconomics.outputSchema.parse(out)).toBeTruthy();
    expect(out.unit_economics.cost_per_qualified_lead).toEqual({ amount_minor: 9000, currency: "GBP" });
    expect(out.unit_economics.cac).toEqual({ amount_minor: 45000, currency: "GBP" });
    expect(out.meta.provenance).toBe("analytics-engine@0.1.0");
  });
});

describe("get_entity_metrics", () => {
  it("returns totals and derived ratios", async () => {
    const out = await getEntityMetrics.handle(makeCtx(), base);
    expect(getEntityMetrics.outputSchema.parse(out)).toBeTruthy();
    expect(out.totals.spend).toEqual({ amount_minor: 360000, currency: "GBP" });
    expect(out.derived.ctr).toBeCloseTo(0.025);
  });
});

describe("get_sales_performance", () => {
  it("returns funnel, roas and close rate", async () => {
    const out = await getSalesPerformance.handle(makeCtx(), base);
    expect(getSalesPerformance.outputSchema.parse(out)).toBeTruthy();
    expect(out.funnel.overall_rate).toBeCloseTo(0.08);
    expect(out.roas).toBeCloseTo(4.4444, 3);
    expect(out.close_rate).toBeCloseTo(8 / 40); // sale / qualified
  });
});

describe("authorization", () => {
  it("rejects a caller without the ads.read capability", async () => {
    const denied = { ...base, authz: { ...AUTHZ, capabilities: [] } };
    await expect(calculateUnitEconomics.handle(makeCtx(), denied)).rejects.toBeInstanceOf(AuthzError);
  });
});
