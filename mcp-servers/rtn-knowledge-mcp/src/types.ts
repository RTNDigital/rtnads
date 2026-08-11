/**
 * RTN Knowledge MCP repository port + types (docs/04 §2.2, docs/05 §B). Strategy
 * Memory: playbooks, curated benchmarks and per-client optimization policies,
 * addressed by scope and by rtn:// URI.
 */

export type Scope = Record<string, string>;

export interface Playbook {
  scope: Scope;
  title: string;
  body_md: string;
  version: number;
  source: string;
}

export interface BenchmarkRef {
  scope: Scope;
  metric: string;
  value: number;
  unit: string;
  sample: Record<string, unknown>;
  source: string;
  version: number;
}

export interface TaxonomyNodeLite {
  key: string;
  label: string;
  path: string;
  level: number;
}

export interface KnowledgeRepository {
  getTaxonomySubtree(verticalKey: string): Promise<TaxonomyNodeLite[]>;
  resolvePlaybook(scope: Scope): Promise<Playbook | null>;
  listBenchmarks(scope: Scope, metrics?: string[]): Promise<BenchmarkRef[]>;
  getOptimizationPolicy(clientId: string): Promise<Record<string, unknown> | null>;
}

/** True if `sub` is contained by `query` (every key in sub matches query). */
export function scopeContainedBy(sub: Scope, query: Scope): boolean {
  return Object.entries(sub).every(([k, v]) => query[k] === v);
}

/** Number of keys — used as a specificity score for best-match resolution. */
export function specificity(scope: Scope): number {
  return Object.keys(scope).length;
}
