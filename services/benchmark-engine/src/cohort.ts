import type { EntityRef } from "@rtnads/contracts";
import {
  combineSimilarity,
  computeInfluence,
  exactMatch,
  taxonomySimilarity,
  bucketSimilarity,
  type DimensionScore,
} from "@rtnads/domain";
import type {
  CohortCandidate,
  DimensionSpec,
  WeightingParams,
} from "./types.js";
import { DEFAULT_WEIGHTING } from "./types.js";

/**
 * Deterministic cohort scoring (docs/02 §5). For each candidate we compute a
 * weighted similarity across context dimensions and an observation `influence`
 * = f(similarity)·g(recency)·h(sample)·q(quality). Pure and reproducible.
 */

export interface ScoredMember {
  entity: EntityRef;
  similarity: number;
  influence: number;
  ageDays: number;
  sampleSize: number;
  metricValue: number;
  context: Record<string, string>;
}

/** Compare one dimension's subject vs candidate value → [0,1]. */
function compareDimension(
  spec: DimensionSpec,
  subjectValue: string | undefined,
  candidateValue: string | undefined,
): number {
  if (subjectValue == null || candidateValue == null) return 0;
  switch (spec.type) {
    case "exact":
      return exactMatch(subjectValue, candidateValue);
    case "taxonomy":
      return taxonomySimilarity(subjectValue, candidateValue);
    case "range": {
      const a = spec.ordinals?.[subjectValue];
      const b = spec.ordinals?.[candidateValue];
      if (a == null || b == null) return exactMatch(subjectValue, candidateValue);
      return bucketSimilarity(a, b, spec.span ?? 1);
    }
  }
}

/**
 * Score every candidate against the subject context and return members sorted by
 * descending influence. Candidates with the subject's own entity id are excluded.
 */
export function scoreMembers(
  subjectEntity: EntityRef,
  subjectContext: Record<string, string>,
  candidates: CohortCandidate[],
  specs: DimensionSpec[],
  weighting: WeightingParams = DEFAULT_WEIGHTING,
): ScoredMember[] {
  const members: ScoredMember[] = [];
  for (const c of candidates) {
    if (c.entity.id === subjectEntity.id && c.entity.type === subjectEntity.type) {
      continue; // never benchmark a subject against itself
    }
    const dims: DimensionScore[] = specs.map((spec) => ({
      key: spec.key,
      weight: spec.weight,
      score: compareDimension(spec, subjectContext[spec.key], c.context[spec.key]),
    }));
    const similarity = combineSimilarity(dims);
    const influence = computeInfluence({
      similarity,
      ageDays: c.ageDays,
      halfLifeDays: weighting.halfLifeDays,
      sampleSize: c.sampleSize,
      sampleK: weighting.sampleK,
      dataQuality: c.dataQuality,
    });
    members.push({
      entity: c.entity,
      similarity,
      influence,
      ageDays: c.ageDays,
      sampleSize: c.sampleSize,
      metricValue: c.metricValue,
      context: c.context,
    });
  }
  members.sort((a, b) => b.influence - a.influence);
  return members;
}

/** Filter a scored cohort to members above a minimum similarity. */
export function filterCohort(
  members: ScoredMember[],
  minSimilarity: number,
): ScoredMember[] {
  return members.filter((m) => m.similarity >= minSimilarity);
}
