import { describe, it, expect } from "vitest";
import { scoreMembers, filterCohort, type ScoredMember } from "./cohort.js";
import {
  weightedQuantile,
  weightedMean,
  weightedPercentileOf,
  assess,
  compareWithCohort,
} from "./benchmark.js";
import { detectAnomalies } from "./anomaly.js";
import {
  BenchmarkEngine,
  DEFAULT_HEALTH_TOURISM_SPECS,
} from "./engine.js";
import { InMemoryBenchmarkRepository } from "./memory-repo.js";
import type { CohortCandidate, BenchmarkDataset } from "./types.js";

const SUBJ_CTX = {
  vertical: "health-tourism",
  subcategory: "health-tourism/rhinoplasty",
  market: "uk",
  platform: "meta",
  objective: "leads",
  conversion_type: "form-lead",
  budget_range: "mid",
  campaign_maturity: "mature",
};
const SUBJECT = { type: "campaign" as const, id: "subj-1" };

const CANDIDATES: CohortCandidate[] = [
  { entity: { type: "campaign", id: "histA" }, context: { ...SUBJ_CTX }, metricValue: 12000, ageDays: 20, sampleSize: 200, dataQuality: 0.95 },
  { entity: { type: "campaign", id: "histC" }, context: { ...SUBJ_CTX }, metricValue: 9000, ageDays: 900, sampleSize: 30, dataQuality: 0.6 },
  { entity: { type: "campaign", id: "histB" }, context: { ...SUBJ_CTX, subcategory: "health-tourism/dental", market: "de" }, metricValue: 18000, ageDays: 30, sampleSize: 150, dataQuality: 0.9 },
  { entity: { type: "campaign", id: "histD" }, context: { vertical: "ecommerce", subcategory: "ecommerce/apparel", market: "us", platform: "google", objective: "sales", conversion_type: "purchase", budget_range: "high", campaign_maturity: "mature" }, metricValue: 5000, ageDays: 100, sampleSize: 100, dataQuality: 0.9 },
];

describe("cohort scoring", () => {
  const scored = scoreMembers(SUBJECT, SUBJ_CTX, CANDIDATES, DEFAULT_HEALTH_TOURISM_SPECS);

  it("gives identical context a similarity of 1", () => {
    expect(scored.find((m) => m.entity.id === "histA")?.similarity).toBeCloseTo(1);
    expect(scored.find((m) => m.entity.id === "histC")?.similarity).toBeCloseTo(1);
  });

  it("ranks recent, high-sample, high-quality above stale (A > C) despite equal similarity", () => {
    const a = scored.find((m) => m.entity.id === "histA")!;
    const c = scored.find((m) => m.entity.id === "histC")!;
    expect(a.similarity).toBeCloseTo(c.similarity);
    expect(a.influence).toBeGreaterThan(c.influence);
    expect(scored[0]!.entity.id).toBe("histA"); // highest influence first
  });

  it("filters out dissimilar campaigns below the similarity floor", () => {
    const kept = filterCohort(scored, 0.5).map((m) => m.entity.id);
    expect(kept).not.toContain("histD");
    expect(kept).toEqual(expect.arrayContaining(["histA", "histB", "histC"]));
  });

  it("never includes the subject itself", () => {
    const withSelf = scoreMembers(
      SUBJECT,
      SUBJ_CTX,
      [...CANDIDATES, { entity: SUBJECT, context: { ...SUBJ_CTX }, metricValue: 1, ageDays: 1, sampleSize: 1, dataQuality: 1 }],
      DEFAULT_HEALTH_TOURISM_SPECS,
    );
    expect(withSelf.some((m) => m.entity.id === "subj-1")).toBe(false);
  });
});

describe("weighted benchmark math", () => {
  it("weightedQuantile / mean / percentile", () => {
    expect(weightedQuantile([10, 20, 30], [1, 1, 1], 0.5)).toBe(20);
    expect(weightedMean([10, 20], [1, 3])).toBe(17.5);
    expect(weightedPercentileOf(15, [10, 20, 30], [1, 1, 1])).toBeCloseTo(1 / 3);
  });

  it("assess respects metric direction", () => {
    expect(assess(0.8, true)).toBe("underperforming"); // cost: high = bad
    expect(assess(0.1, true)).toBe("outperforming");
    expect(assess(0.8, false)).toBe("outperforming"); // roas: high = good
    expect(assess(0.5, true)).toBe("within_expected");
  });

  it("compareWithCohort is a golden calculation", () => {
    const members = [
      { metricValue: 9000, influence: 1, sampleSize: 30 },
      { metricValue: 12000, influence: 1, sampleSize: 200 },
      { metricValue: 18000, influence: 1, sampleSize: 150 },
    ] as ScoredMember[];
    const c = compareWithCohort("cost_per_qualified_lead", 20000, members, true);
    expect(c.cohort.p50).toBe(12000);
    expect(c.cohort.weighted_mean).toBeCloseTo(13000);
    expect(c.percentile).toBeCloseTo(1); // subject above all → worst
    expect(c.assessment).toBe("underperforming");
    expect(c.cohort_size).toBe(3);
    expect(c.effective_sample).toBe(380);
  });

  it("returns insufficient-evidence shape for an empty cohort (no fabrication)", () => {
    const c = compareWithCohort("cpl", 5000, [], true);
    expect(c.cohort_size).toBe(0);
    expect(Number.isNaN(c.percentile)).toBe(true);
    expect(c.assessment).toBe("within_expected");
  });
});

describe("anomaly detection", () => {
  it("flags a spike with a robust modified z-score", () => {
    const series = [
      { date: "2026-07-01", value: 50 },
      { date: "2026-07-02", value: 52 },
      { date: "2026-07-03", value: 48 },
      { date: "2026-07-04", value: 51 },
      { date: "2026-07-05", value: 49 },
      { date: "2026-07-06", value: 200 },
      { date: "2026-07-07", value: 50 },
      { date: "2026-07-08", value: 51 },
    ];
    const anomalies = detectAnomalies("cpl", series);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ date: "2026-07-06", kind: "spike" });
  });

  it("returns nothing for short or flat series (no fabricated flags)", () => {
    expect(detectAnomalies("cpl", [{ date: "d1", value: 1 }, { date: "d2", value: 2 }])).toEqual([]);
    const flat = Array.from({ length: 8 }, (_, i) => ({ date: `d${i}`, value: 50 }));
    expect(detectAnomalies("cpl", flat)).toEqual([]);
  });
});

describe("BenchmarkEngine (via in-memory repo)", () => {
  const dataset: BenchmarkDataset = {
    subject: {
      entity: SUBJECT,
      context: SUBJ_CTX,
      metricValue: 20000,
      series: [
        { date: "2026-07-01", value: 50 },
        { date: "2026-07-02", value: 52 },
        { date: "2026-07-03", value: 48 },
        { date: "2026-07-04", value: 51 },
        { date: "2026-07-05", value: 49 },
        { date: "2026-07-06", value: 200 },
        { date: "2026-07-07", value: 50 },
        { date: "2026-07-08", value: 51 },
      ],
    },
    candidates: CANDIDATES,
    metric: "cost_per_qualified_lead",
    lowerIsBetter: true,
  };
  const engine = new BenchmarkEngine(
    new InMemoryBenchmarkRepository(new Map([["subj-1", dataset]])),
  );
  const window = { start: "2026-07-01", end: "2026-07-31" };

  it("builds a cohort and benchmarks the subject", async () => {
    const r = await engine.compareWithCohort("client-1", SUBJECT, "cost_per_qualified_lead", window);
    expect(r.members.map((m) => m.entity.id)).not.toContain("histD"); // filtered
    expect(r.members[0]!.entity.id).toBe("histA"); // most influential
    expect(r.comparison.assessment).toBe("underperforming"); // subject cost above cohort
    expect(r.comparison.cohort_size).toBeGreaterThanOrEqual(3);
  });

  it("detects anomalies in the subject series", async () => {
    const anomalies = await engine.detectAnomalies("client-1", SUBJECT, "cpl", window);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.kind).toBe("spike");
  });

  it("is deterministic", async () => {
    const a = await engine.compareWithCohort("c", SUBJECT, "cost_per_qualified_lead", window);
    const b = await engine.compareWithCohort("c", SUBJECT, "cost_per_qualified_lead", window);
    expect(b).toEqual(a);
  });
});
