/**
 * Deterministic similarity & observation-weighting.
 *
 * This is the mathematical heart of cohort selection (docs/02-domain-model.md §5).
 * It lives in the deterministic layer — NOT the LLM. Every function here is pure
 * and reproducible: same inputs → same output, no wall-clock, no randomness.
 *
 *   similarity = Σ(weightᵢ · compareᵢ),           normalized to [0,1]
 *   influence  = f(similarity)·g(recency)·h(sample)·q(quality)
 */

// ── Per-dimension comparators (each returns [0,1]) ──────────────────────────

/** Exact / normalized equality comparator. */
export function exactMatch(a: string, b: string): number {
  return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
}

/**
 * Hierarchical similarity between two taxonomy paths (e.g.
 * "health-tourism/rhinoplasty" vs "health-tourism/dental").
 * Similarity = sharedDepth / maxDepth. Identical paths → 1; disjoint roots → 0.
 */
export function taxonomySimilarity(pathA: string, pathB: string): number {
  const a = pathA.split("/").filter(Boolean);
  const b = pathB.split("/").filter(Boolean);
  const maxDepth = Math.max(a.length, b.length);
  if (maxDepth === 0) return 1;
  let shared = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) shared++;
    else break;
  }
  return shared / maxDepth;
}

/**
 * Ordered-bucket similarity for range dimensions (e.g. budget_range bands).
 * `span` is the number of buckets − 1. Adjacent buckets are close, far buckets 0.
 */
export function bucketSimilarity(
  ordinalA: number,
  ordinalB: number,
  span: number,
): number {
  if (span <= 0) return 1;
  const dist = Math.abs(ordinalA - ordinalB);
  return Math.max(0, 1 - dist / span);
}

/** Cosine similarity for embedding dimensions, clamped to [0,1]. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Math.min(1, Math.max(0, cos));
}

// ── Weighted overall similarity ─────────────────────────────────────────────

export interface DimensionScore {
  /** Dimension key, e.g. "subcategory". */
  key: string;
  /** Per-dimension comparator result in [0,1]. */
  score: number;
  /** Non-negative weight; weights are normalized internally. */
  weight: number;
}

/**
 * Combine per-dimension scores into an overall similarity in [0,1].
 * Weights need not sum to 1 — they are normalized. Zero total weight → 0.
 */
export function combineSimilarity(dimensions: readonly DimensionScore[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const d of dimensions) {
    const w = Math.max(0, d.weight);
    const s = clamp01(d.score);
    weighted += w * s;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  return clamp01(weighted / totalWeight);
}

// ── Observation weighting (influence) ───────────────────────────────────────

export interface InfluenceInputs {
  /** Overall similarity of the historical observation to the subject, [0,1]. */
  similarity: number;
  /** Age of the observation in days (>= 0). */
  ageDays: number;
  /** Recency half-life in days (> 0). Old data must not equal recent data. */
  halfLifeDays: number;
  /** Sample size (e.g. conversions) backing the observation (>= 0). */
  sampleSize: number;
  /** Saturation constant k for the sample term (> 0). */
  sampleK?: number;
  /** Data-quality score in [0,1] (freshness/completeness). */
  dataQuality: number;
}

/** f(similarity): identity — closer cohorts count more. */
export function recencyWeight(ageDays: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return ageDays <= 0 ? 1 : 0;
  return Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
}

/** h(sample): saturating in sample size — more evidence, more trust. */
export function sampleWeight(sampleSize: number, k = 20): number {
  const n = Math.max(0, sampleSize);
  return n / (n + Math.max(1e-9, k));
}

/**
 * influence = f(similarity)·g(recency)·h(sample)·q(quality), all in [0,1] → [0,1].
 * This is the value persisted per cohort member for audit/reconstruction.
 */
export function computeInfluence(inp: InfluenceInputs): number {
  const f = clamp01(inp.similarity);
  const g = recencyWeight(inp.ageDays, inp.halfLifeDays);
  const h = sampleWeight(inp.sampleSize, inp.sampleK ?? 20);
  const q = clamp01(inp.dataQuality);
  return clamp01(f * g * h * q);
}

// ── helpers ─────────────────────────────────────────────────────────────────
export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
