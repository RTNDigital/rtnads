import type { Pool } from "pg";
import type {
  KnowledgeRepository,
  Playbook,
  BenchmarkRef,
  TaxonomyNodeLite,
  Scope,
} from "./types.js";

/** Postgres-backed Strategy Memory. Scope matching uses jsonb containment. */
export class PgKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly pool: Pool) {}

  async getTaxonomySubtree(verticalKey: string): Promise<TaxonomyNodeLite[]> {
    const { rows } = await this.pool.query(
      "SELECT key,label,path,level FROM taxonomy.node WHERE path=$1 OR path LIKE $1 || '/%' ORDER BY path",
      [verticalKey],
    );
    return rows.map((r) => ({ key: r.key, label: r.label, path: r.path, level: Number(r.level) }));
  }

  async resolvePlaybook(scope: Scope): Promise<Playbook | null> {
    const { rows } = await this.pool.query(
      `SELECT scope,title,body_md,version,source FROM knowledge.playbook
        WHERE scope <@ $1::jsonb AND status='active'
        ORDER BY (SELECT count(*) FROM jsonb_object_keys(scope)) DESC LIMIT 1`,
      [JSON.stringify(scope)],
    );
    const r = rows[0];
    return r ? { scope: r.scope, title: r.title, body_md: r.body_md, version: Number(r.version), source: r.source } : null;
  }

  async listBenchmarks(scope: Scope, metrics?: string[]): Promise<BenchmarkRef[]> {
    const { rows } = await this.pool.query(
      `SELECT scope,metric,value,unit,sample,source,version FROM knowledge.benchmark_ref
        WHERE scope <@ $1::jsonb AND ($2::text[] IS NULL OR metric = ANY($2))`,
      [JSON.stringify(scope), metrics ?? null],
    );
    return rows.map((r) => ({
      scope: r.scope, metric: r.metric, value: Number(r.value), unit: r.unit,
      sample: r.sample, source: r.source, version: Number(r.version),
    }));
  }

  async getOptimizationPolicy(clientId: string): Promise<Record<string, unknown> | null> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.client_id', $1, true)", [clientId]);
      const { rows } = await client.query(
        "SELECT definition FROM knowledge.optimization_policy WHERE client_id=$1 AND enabled LIMIT 1",
        [clientId],
      );
      return rows[0]?.definition ?? null;
    } finally {
      client.release();
    }
  }
}
