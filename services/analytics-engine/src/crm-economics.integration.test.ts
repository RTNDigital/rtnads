import { describe, it, expect, afterAll } from "vitest";
import pg from "pg";
import { AnalyticsEngine } from "./engine.js";
import { PgAnalyticsRepository } from "./pg-repo.js";

/**
 * Integration test for CRM-driven funnel economics. Runs only when CRM_LOADED=1
 * (set in CI after BOTH the ads read-path AND the CRM read-path have loaded the
 * fixtures). Proves that Health Tourism optimizes on the FUNNEL, not CPL alone
 * (docs/02 §6, docs/11).
 *
 * With 10 attributed leads / 4 qualified / 2 booking / 1 sale and campaign spend
 * £105.10 (10510 minor):
 *   cpl                     = 10510 / 10 = 1051
 *   cost per qualified lead = 10510 /  4 = 2627.5 → 2628
 *   cost per booking        = 10510 /  2 = 5255
 *   cac                     = 10510 /  1 = 10510
 *   revenue per lead        = 500000 / 10 = 50000
 */
const url = process.env.DATABASE_URL;
const enabled = url && process.env.CRM_LOADED === "1";
const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const suite = enabled ? describe : describe.skip;

suite("CRM funnel economics (warehouse → engine)", () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(async () => {
    await pool.end();
  });

  it("computes qualified-lead / booking / CAC economics from CRM outcomes", async () => {
    const { rows } = await pool.query(
      "SELECT id FROM core.campaign WHERE external_id='camp_2001' AND client_id=$1",
      [CLIENT],
    );
    const campaignId = rows[0].id;

    const engine = new AnalyticsEngine(new PgAnalyticsRepository(pool));
    const a = await engine.analyze(
      CLIENT,
      { type: "campaign", id: campaignId },
      { start: "2026-07-01", end: "2026-07-31" },
      "health_tourism",
    );

    // Funnel counts came from CRM.
    const stage = (k: string) => a.funnel.stages.find((s) => s.key === k)?.count;
    expect(stage("lead")).toBe(10);
    expect(stage("qualified")).toBe(4);
    expect(stage("booking")).toBe(2);
    expect(stage("sale")).toBe(1);
    expect(a.funnel.overall_rate).toBeCloseTo(0.1); // sale/lead

    // Business-specific unit economics (not just CPL).
    expect(a.unit_economics.cpl).toEqual({ amount_minor: 1051, currency: "GBP" });
    expect(a.unit_economics.cost_per_qualified_lead).toEqual({ amount_minor: 2628, currency: "GBP" });
    expect(a.unit_economics.cost_per_booking).toEqual({ amount_minor: 5255, currency: "GBP" });
    expect(a.unit_economics.cac).toEqual({ amount_minor: 10510, currency: "GBP" });
    expect(a.unit_economics.revenue_per_lead).toEqual({ amount_minor: 50000, currency: "GBP" });
  });
});
