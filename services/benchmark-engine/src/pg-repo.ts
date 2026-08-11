import type { Pool, PoolClient } from "pg";
import type { EntityRef } from "@rtnads/contracts";
import type {
  BenchmarkRepository,
  BenchmarkDataset,
  CohortCandidate,
  DateWindow,
} from "./types.js";

/**
 * Postgres-backed benchmark repository. Assembles a BenchmarkDataset from the
 * warehouse (docs/02 §5): the subject's context from `taxonomy.classification`,
 * its metric over the requested window, and a candidate cohort of the client's
 * OTHER campaigns with their historical metric, recency, sample and context.
 *
 * Only aggregation runs in SQL; the weighting/statistics are pure (the engine).
 * Tenancy: filters by client_id and sets `app.client_id` (RLS defense in depth).
 *
 * Metric support (M2): `cpl` = Σ spend_minor / Σ conversions (lower is better).
 * The metric name selects the numerator/denominator; extend the map for more.
 */

const METRIC_SQL: Record<
  string,
  { expr: string; lowerIsBetter: boolean }
> = {
  cpl: {
    expr: "SUM(spend_minor)::float / NULLIF(SUM(conversions), 0)",
    lowerIsBetter: true,
  },
};

export class PgBenchmarkRepository implements BenchmarkRepository {
  constructor(private readonly pool: Pool) {}

  async load(
    clientId: string,
    entity: EntityRef,
    metric: string,
    window: DateWindow,
  ): Promise<BenchmarkDataset> {
    const m = METRIC_SQL[metric];
    if (!m) throw new Error(`unsupported benchmark metric: ${metric}`);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.client_id', $1, true)", [clientId]);

      const subjectContext = await this.contextFor(client, clientId, [entity.id]);
      const subjectMetric = await this.subjectMetric(client, clientId, entity, window, m.expr);
      const series = await this.subjectSeries(client, clientId, entity, window);
      const candidates = await this.candidates(client, clientId, entity, window, m.expr);

      await client.query("COMMIT");
      return {
        subject: {
          entity,
          context: subjectContext.get(entity.id) ?? {},
          metricValue: subjectMetric,
          series,
        },
        candidates,
        metric,
        lowerIsBetter: m.lowerIsBetter,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /** Current context vectors for a set of campaign ids → id → {dim: value}. */
  private async contextFor(
    client: PoolClient,
    clientId: string,
    entityIds: string[],
  ): Promise<Map<string, Record<string, string>>> {
    const out = new Map<string, Record<string, string>>();
    if (entityIds.length === 0) return out;
    const { rows } = await client.query(
      `SELECT c.entity_id, d.key, c.value
         FROM taxonomy.classification c
         JOIN taxonomy.dimension d ON d.id = c.dimension_id
        WHERE c.client_id = $1 AND c.entity_type = 'campaign'
          AND c.entity_id = ANY($2::uuid[]) AND c.valid_to IS NULL`,
      [clientId, entityIds],
    );
    for (const r of rows) {
      const ctx = out.get(r.entity_id) ?? {};
      ctx[r.key] = r.value;
      out.set(r.entity_id, ctx);
    }
    return out;
  }

  private async subjectMetric(
    client: PoolClient,
    clientId: string,
    entity: EntityRef,
    window: DateWindow,
    expr: string,
  ): Promise<number> {
    const { rows } = await client.query(
      `SELECT ${expr} AS v
         FROM facts.entity_daily
        WHERE client_id=$1 AND entity_type=$2 AND entity_id=$3
          AND date BETWEEN $4 AND $5`,
      [clientId, entity.type, entity.id, window.start, window.end],
    );
    return rows[0]?.v == null ? NaN : Number(rows[0].v);
  }

  private async subjectSeries(
    client: PoolClient,
    clientId: string,
    entity: EntityRef,
    window: DateWindow,
  ): Promise<{ date: string; value: number }[]> {
    const { rows } = await client.query(
      `SELECT to_char(date,'YYYY-MM-DD') AS d,
              spend_minor::float / NULLIF(conversions,0) AS v
         FROM facts.entity_daily
        WHERE client_id=$1 AND entity_type=$2 AND entity_id=$3
          AND date BETWEEN $4 AND $5 AND conversions > 0
        ORDER BY date`,
      [clientId, entity.type, entity.id, window.start, window.end],
    );
    return rows.map((r) => ({ date: r.d, value: Number(r.v) }));
  }

  /**
   * Candidate cohort: the client's OTHER campaigns, each aggregated over ALL its
   * facts (its historical performance), with recency measured from the subject
   * window's end so stale campaigns are down-weighted by the engine.
   */
  private async candidates(
    client: PoolClient,
    clientId: string,
    entity: EntityRef,
    window: DateWindow,
    expr: string,
  ): Promise<CohortCandidate[]> {
    const { rows } = await client.query(
      `SELECT entity_id,
              ${expr} AS metric_value,
              SUM(conversions) AS sample_size,
              ($3::date - MAX(date)) AS age_days
         FROM facts.entity_daily
        WHERE client_id=$1 AND entity_type='campaign' AND entity_id <> $2
        GROUP BY entity_id
       HAVING SUM(conversions) > 0`,
      [clientId, entity.id, window.end],
    );
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.entity_id);
    const contexts = await this.contextFor(client, clientId, ids);
    return rows.map((r) => ({
      entity: { type: "campaign", id: r.entity_id },
      context: contexts.get(r.entity_id) ?? {},
      metricValue: Number(r.metric_value),
      ageDays: Math.max(0, Number(r.age_days)),
      sampleSize: Number(r.sample_size),
      dataQuality: 1,
    }));
  }
}
