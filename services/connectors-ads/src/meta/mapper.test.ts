import { describe, it, expect } from "vitest";
import {
  majorDecimalToMinor,
  budgetMinor,
  mapStatus,
  mapInsight,
  sumConversions,
} from "./mapper.js";
import { MetaConnector } from "./connector.js";
import { FixtureMetaSource } from "./fixtures.js";
import { DEFAULT_META_CONFIG } from "../types.js";
import { NormalizedSync } from "@rtnads/contracts";

describe("money & status helpers", () => {
  it("converts major-unit decimal strings to minor units", () => {
    expect(majorDecimalToMinor("42.10")).toBe(4210);
    expect(majorDecimalToMinor("105.1")).toBe(10510);
    expect(majorDecimalToMinor("63")).toBe(6300);
    expect(majorDecimalToMinor("")).toBe(0);
    expect(majorDecimalToMinor(undefined)).toBe(0);
  });

  it("reads Meta minor-unit budgets", () => {
    expect(budgetMinor("5000")).toBe(5000);
    expect(budgetMinor(undefined)).toBeNull();
  });

  it("normalizes status vocabulary", () => {
    expect(mapStatus("ACTIVE")).toBe("active");
    expect(mapStatus("PAUSED")).toBe("paused");
    expect(mapStatus(undefined)).toBe("unknown");
  });

  it("sums only configured conversion action types", () => {
    const actions = [
      { action_type: "lead", value: "6" },
      { action_type: "link_click", value: "120" },
    ];
    expect(sumConversions(actions, ["lead"])).toBe(6);
  });
});

describe("mapInsight", () => {
  it("maps a lead insight to a normalized fact", () => {
    const fact = mapInsight(
      {
        level: "ad",
        ad_id: "ad_4001",
        date_start: "2026-07-01",
        date_stop: "2026-07-01",
        spend: "42.10",
        impressions: "3120",
        clicks: "88",
        actions: [{ action_type: "lead", value: "3" }],
      },
      "GBP",
      DEFAULT_META_CONFIG,
    );
    expect(fact).not.toBeNull();
    expect(fact).toMatchObject({
      entity_type: "ad",
      entity_external_id: "ad_4001",
      date: "2026-07-01",
      currency: "GBP",
      spend_minor: 4210,
      impressions: 3120,
      clicks: 88,
      conversions: 3,
    });
  });

  it("returns null for an insight with no resolvable entity id", () => {
    expect(
      mapInsight(
        { level: "ad", date_start: "2026-07-01", date_stop: "2026-07-01" },
        "GBP",
        DEFAULT_META_CONFIG,
      ),
    ).toBeNull();
  });
});

describe("MetaConnector.pull (fixtures)", () => {
  it("produces a valid, fully normalized sync", async () => {
    const connector = new MetaConnector(new FixtureMetaSource());
    const sync = await connector.pull({
      client_id: "11111111-1111-1111-1111-111111111111",
      account_external_id: "act_1001",
      window: { start: "2026-07-01", end: "2026-07-01" },
    });

    // Contract-valid by construction (pull() calls NormalizedSync.parse).
    expect(() => NormalizedSync.parse(sync)).not.toThrow();

    expect(sync.account.currency).toBe("GBP");
    expect(sync.campaigns).toHaveLength(1);
    expect(sync.campaigns[0]?.account_external_id).toBe("act_1001");
    expect(sync.ad_sets).toHaveLength(2);
    expect(sync.ads).toHaveLength(2);
    expect(sync.creatives).toHaveLength(2);
    expect(sync.facts).toHaveLength(3);

    // daily vs lifetime budget mapping
    const daily = sync.ad_sets.find((s) => s.external_id === "adset_3001");
    const lifetime = sync.ad_sets.find((s) => s.external_id === "adset_3002");
    expect(daily).toMatchObject({ budget_minor: 5000, budget_type: "daily" });
    expect(lifetime).toMatchObject({ budget_minor: 120000, budget_type: "lifetime" });

    // deterministic: same input → identical output
    const sync2 = await connector.pull({
      client_id: "11111111-1111-1111-1111-111111111111",
      account_external_id: "act_1001",
      window: { start: "2026-07-01", end: "2026-07-01" },
    });
    expect(sync2).toEqual(sync);
  });
});
