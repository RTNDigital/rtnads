import { describe, it, expect, afterAll } from "vitest";
import pg from "pg";
import { BenchmarkEngine } from "./engine.js";
import { PgBenchmarkRepository } from "./pg-repo.js";

/**
 * Full warehouse → Benchmark Engine integration. Runs when DATABASE_URL and
 * HIST_LOADED=1 are set (CI, after the ads/CRM read-paths + classification + the
 * historical fixtures are loaded). Proves cohort benchmarking on real data:
 * the dissimilar dental/DE campaign is filtered out, and stale data counts less
 * (docs/02 §5).
 */
const url = process.env.DATABASE_URL;
const enabled = url && process.env.HIST_LOADED === "1";
const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const suite = enabled ? describe : describe.skip;

suite("PgBenchmarkRepository (warehouse → cohort benchmark)", () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(async () => {
    await pool.end();
  });

  it("builds an influence-weighted cohort and benchmarks the subject", async () => {
    // Resolve external_id → uuid for the subject and the historical campaigns.
    const { rows } = await pool.query(
      "SELECT id, external_id FROM core.campaign WHERE client_id=$1",
      [CLIENT],
    );
    const byExt = new Map(rows.map((r) => [r.external_id, r.id]));
    const byId = new Map(rows.map((r) => [r.id, r.external_id]));
    const subjectId = byExt.get("camp_2001");
    expect(subjectId).toBeTruthy();

    const engine = new BenchmarkEngine(new PgBenchmarkRepository(pool));
    const r = await engine.compareWithCohort(
      CLIENT,
      { type: "campaign", id: subjectId },
      "cpl",
      { start: "2026-07-01", end: "2026-07-31" },
    );

    const memberExts = r.members.map((m) => byId.get(m.entity.id));
    // The dissimilar dental/DE/Google campaign falls below the similarity floor.
    expect(memberExts).not.toContain("camp_hist_d");
    // The three comparable rhinoplasty/UK campaigns form the cohort.
    expect(memberExts).toEqual(expect.arrayContaining(["camp_hist_a", "camp_hist_b", "camp_hist_c"]));
    expect(r.comparison.cohort_size).toBe(3);

    // Stale data counts less: hist_C (Jan) has lower influence than hist_A (Jul).
    const infl = (ext: string) =>
      r.members.find((m) => byId.get(m.entity.id) === ext)!.influence;
    expect(infl("camp_hist_a")).toBeGreaterThan(infl("camp_hist_c"));

    // Subject CPL (£11.68 = 10510/9) is below the cohort (£30–£90) → outperforming.
    expect(r.comparison.assessment).toBe("outperforming");
    expect(r.comparison.cohort.p50).toBeGreaterThan(r.comparison.subject_value);
  });
});
