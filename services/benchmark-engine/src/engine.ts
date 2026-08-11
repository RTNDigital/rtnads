import type { EntityRef } from "@rtnads/contracts";
import type {
  BenchmarkRepository,
  DimensionSpec,
  WeightingParams,
  DateWindow,
} from "./types.js";
import { DEFAULT_WEIGHTING } from "./types.js";
import { scoreMembers, filterCohort, type ScoredMember } from "./cohort.js";
import { compareWithCohort, type CohortComparison } from "./benchmark.js";
import { detectAnomalies, type Anomaly } from "./anomaly.js";

/**
 * Default per-dimension weights for cohort similarity (docs/02 §5). What makes
 * campaigns "comparable" differs by vertical; these are the Health Tourism
 * defaults and would be overridden from Strategy Memory per vertical.
 */
export const DEFAULT_HEALTH_TOURISM_SPECS: DimensionSpec[] = [
  { key: "vertical", weight: 3, type: "exact" },
  { key: "subcategory", weight: 3, type: "taxonomy" },
  { key: "market", weight: 2, type: "exact" },
  { key: "platform", weight: 2, type: "exact" },
  { key: "objective", weight: 1, type: "exact" },
  { key: "conversion_type", weight: 1, type: "exact" },
  {
    key: "budget_range",
    weight: 1,
    type: "range",
    ordinals: { low: 0, mid: 1, high: 2 },
    span: 2,
  },
  {
    key: "campaign_maturity",
    weight: 1,
    type: "range",
    ordinals: { learning: 0, stabilizing: 1, mature: 2 },
    span: 2,
  },
];

export interface BuildCohortOptions {
  specs?: DimensionSpec[];
  weighting?: WeightingParams;
  minSimilarity?: number;
}

export interface CohortResult {
  subject: EntityRef;
  members: ScoredMember[];
  weighting: WeightingParams;
  min_similarity: number;
}

export interface BenchmarkResult extends CohortResult {
  comparison: CohortComparison;
}

/** Orchestrates load → score → compare/detect. Pure math, thin data access. */
export class BenchmarkEngine {
  constructor(private readonly repo: BenchmarkRepository) {}

  private buildFrom(
    subjectEntity: EntityRef,
    subjectContext: Record<string, string>,
    candidates: Parameters<typeof scoreMembers>[2],
    opts: BuildCohortOptions,
  ): CohortResult {
    const specs = opts.specs ?? DEFAULT_HEALTH_TOURISM_SPECS;
    const weighting = opts.weighting ?? DEFAULT_WEIGHTING;
    const minSimilarity = opts.minSimilarity ?? 0.5;
    const scored = scoreMembers(
      subjectEntity,
      subjectContext,
      candidates,
      specs,
      weighting,
    );
    return {
      subject: subjectEntity,
      members: filterCohort(scored, minSimilarity),
      weighting,
      min_similarity: minSimilarity,
    };
  }

  async buildCohort(
    clientId: string,
    entity: EntityRef,
    metric: string,
    window: DateWindow,
    opts: BuildCohortOptions = {},
  ): Promise<CohortResult> {
    const ds = await this.repo.load(clientId, entity, metric, window);
    return this.buildFrom(ds.subject.entity, ds.subject.context, ds.candidates, opts);
  }

  async compareWithCohort(
    clientId: string,
    entity: EntityRef,
    metric: string,
    window: DateWindow,
    opts: BuildCohortOptions = {},
  ): Promise<BenchmarkResult> {
    const ds = await this.repo.load(clientId, entity, metric, window);
    const cohort = this.buildFrom(
      ds.subject.entity,
      ds.subject.context,
      ds.candidates,
      opts,
    );
    const comparison = compareWithCohort(
      metric,
      ds.subject.metricValue,
      cohort.members,
      ds.lowerIsBetter,
    );
    return { ...cohort, comparison };
  }

  async detectAnomalies(
    clientId: string,
    entity: EntityRef,
    metric: string,
    window: DateWindow,
    threshold?: number,
  ): Promise<Anomaly[]> {
    const ds = await this.repo.load(clientId, entity, metric, window);
    return detectAnomalies(metric, ds.subject.series ?? [], { threshold });
  }
}
