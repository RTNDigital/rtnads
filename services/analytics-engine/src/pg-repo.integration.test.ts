import { describe, it, expect, afterAll } from "vitest";
import pg from "pg";
import { AnalyticsEngine } from "./engine.js";
import { PgAnalyticsRepository } from "./pg-repo.js";

/**
 * Integration test: warehouse → deterministic engine, against a real Postgres.
 * Self-skips when DATABASE_URL is unset (e.g. local `pnpm test`), and runs in the
 * CI `database` job after migrations + seed + the connector read-path have loaded
 * the M0 fixture account (docs/14 §8).
 *
 * Expected numbers come from the fixture campaign-level insight (docs/11 example):
 * spend £105.10 = 10510 minor, impressions 7620, clicks 208, 9 leads.
 */
const url = process.env.DATABASE_URL;
const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const suite = url ? describe : describe.skip;

suite("PgAnalyticsRepository (warehouse → engine)", () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(async () => {
    await pool.end();
  });

  it("computes deterministic analytics from loaded warehouse facts", async () => {
    const { rows } = await pool.query(
      "SELECT id FROM core.campaign WHERE external_id='camp_2001' AND client_id=$1",
      [CLIENT],
    );
    expect(rows.length).toBe(1);
    const campaignId = rows[0].id;

    const engine = new AnalyticsEngine(new PgAnalyticsRepository(pool));
    const a = await engine.analyze(
      CLIENT,
      { type: "campaign", id: campaignId },
      { start: "2026-07-01", end: "2026-07-31" },
      "health_tourism",
    );

    expect(a.totals.spend).toEqual({ amount_minor: 10510, currency: "GBP" });
    expect(a.totals.impressions).toBe(7620);
    expect(a.totals.clicks).toBe(208);
    expect(a.totals.conversions).toBe(9);
    // cpl = 10510 / 9 = 1167.78 → 1168 minor (rounded). No CRM funnel yet, so
    // unit economics falls back to platform conversions for leads.
    expect(a.unit_economics.cpl).toEqual({ amount_minor: 1168, currency: "GBP" });
    expect(a.derived.ctr).toBeCloseTo(208 / 7620, 6);
  });
});
