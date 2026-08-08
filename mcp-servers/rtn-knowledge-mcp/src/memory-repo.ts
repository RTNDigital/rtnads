import {
  type KnowledgeRepository,
  type Playbook,
  type BenchmarkRef,
  type TaxonomyNodeLite,
  type Scope,
  scopeContainedBy,
  specificity,
} from "./types.js";

/** In-memory Strategy Memory for tests and fixtures. */
export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  constructor(
    private readonly data: {
      taxonomy?: TaxonomyNodeLite[];
      playbooks?: Playbook[];
      benchmarks?: BenchmarkRef[];
      policies?: Record<string, Record<string, unknown>>;
    } = {},
  ) {}

  async getTaxonomySubtree(verticalKey: string): Promise<TaxonomyNodeLite[]> {
    return (this.data.taxonomy ?? []).filter(
      (n) => n.path === verticalKey || n.path.startsWith(`${verticalKey}/`),
    );
  }

  async resolvePlaybook(scope: Scope): Promise<Playbook | null> {
    const matches = (this.data.playbooks ?? [])
      .filter((p) => scopeContainedBy(p.scope, scope))
      .sort((a, b) => specificity(b.scope) - specificity(a.scope));
    return matches[0] ?? null;
  }

  async listBenchmarks(scope: Scope, metrics?: string[]): Promise<BenchmarkRef[]> {
    return (this.data.benchmarks ?? [])
      .filter((b) => scopeContainedBy(b.scope, scope))
      .filter((b) => !metrics || metrics.includes(b.metric));
  }

  async getOptimizationPolicy(clientId: string): Promise<Record<string, unknown> | null> {
    return this.data.policies?.[clientId] ?? null;
  }
}
