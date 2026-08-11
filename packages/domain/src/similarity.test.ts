import { describe, it, expect } from "vitest";
import {
  combineSimilarity,
  computeInfluence,
  recencyWeight,
  sampleWeight,
  taxonomySimilarity,
  bucketSimilarity,
  cosineSimilarity,
  exactMatch,
} from "./similarity.js";

/**
 * These tests encode the invariants from docs/14-testing-strategy.md §2.
 * They are the guardrails on the deterministic weighting math.
 */

describe("comparators", () => {
  it("exactMatch is case/space-insensitive", () => {
    expect(exactMatch("Meta", " meta ")).toBe(1);
    expect(exactMatch("meta", "google")).toBe(0);
  });

  it("taxonomySimilarity: identical paths → 1, disjoint roots → 0", () => {
    expect(taxonomySimilarity("health-tourism/rhinoplasty", "health-tourism/rhinoplasty")).toBe(1);
    expect(taxonomySimilarity("health-tourism/dental", "ecommerce/apparel")).toBe(0);
  });

  it("taxonomySimilarity: shared prefix is partial", () => {
    const s = taxonomySimilarity("health-tourism/rhinoplasty", "health-tourism/dental");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it("bucketSimilarity: adjacent buckets are closer than far ones", () => {
    expect(bucketSimilarity(0, 0, 3)).toBe(1);
    expect(bucketSimilarity(0, 1, 3)).toBeGreaterThan(bucketSimilarity(0, 3, 3));
  });

  it("cosineSimilarity: identical vectors → 1, orthogonal → 0", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("combineSimilarity", () => {
  it("is bounded in [0,1]", () => {
    const s = combineSimilarity([
      { key: "vertical", score: 1, weight: 3 },
      { key: "market", score: 0.5, weight: 1 },
    ]);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("identical context (all scores 1) → similarity 1", () => {
    const s = combineSimilarity([
      { key: "a", score: 1, weight: 2 },
      { key: "b", score: 1, weight: 5 },
    ]);
    expect(s).toBe(1);
  });

  it("zero total weight → 0 (no fabricated similarity)", () => {
    expect(combineSimilarity([{ key: "a", score: 1, weight: 0 }])).toBe(0);
  });

  it("normalizes weights (weights need not sum to 1)", () => {
    const a = combineSimilarity([{ key: "x", score: 0.4, weight: 1 }]);
    const b = combineSimilarity([{ key: "x", score: 0.4, weight: 1000 }]);
    expect(a).toBeCloseTo(b);
  });
});

describe("observation weighting invariants", () => {
  it("recencyWeight is monotonically non-increasing in age", () => {
    const hl = 180;
    let prev = Infinity;
    for (let age = 0; age <= 720; age += 30) {
      const w = recencyWeight(age, hl);
      expect(w).toBeLessThanOrEqual(prev + 1e-12);
      prev = w;
    }
    expect(recencyWeight(0, hl)).toBeCloseTo(1);
    expect(recencyWeight(hl, hl)).toBeCloseTo(0.5);
  });

  it("sampleWeight is monotonically non-decreasing in sample size", () => {
    let prev = -Infinity;
    for (const n of [0, 5, 20, 50, 200, 1000]) {
      const w = sampleWeight(n);
      expect(w).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = w;
    }
  });

  it("influence ∈ [0,1] and is 0 when any factor is 0", () => {
    const base = {
      similarity: 0.8,
      ageDays: 40,
      halfLifeDays: 180,
      sampleSize: 200,
      dataQuality: 0.9,
    };
    const inf = computeInfluence(base);
    expect(inf).toBeGreaterThan(0);
    expect(inf).toBeLessThanOrEqual(1);
    expect(computeInfluence({ ...base, similarity: 0 })).toBe(0);
    expect(computeInfluence({ ...base, dataQuality: 0 })).toBe(0);
  });

  it("recent, larger, higher-quality data has more influence (stale ≠ recent)", () => {
    const recent = computeInfluence({
      similarity: 0.8,
      ageDays: 10,
      halfLifeDays: 180,
      sampleSize: 500,
      dataQuality: 0.95,
    });
    const stale = computeInfluence({
      similarity: 0.8,
      ageDays: 900,
      halfLifeDays: 180,
      sampleSize: 30,
      dataQuality: 0.6,
    });
    expect(recent).toBeGreaterThan(stale);
  });
});
