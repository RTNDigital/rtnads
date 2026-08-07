import type { Pool, PoolClient } from "pg";
import type { EntityRef, UnitEconomicsModel } from "@rtnads/contracts";
import type {
  AnalyticsRepository,
  AnalyticsInputs,
  DateWindow,
  FactAggregate,
  StageDef,
  FunnelCounts,
  SalesAggregate,
} from "./types.js";

/**
 * Postgres-backed analytics repository. Reads aggregated facts + CRM outcomes
 * from the warehouse and hands typed inputs to the pure engine.
 *
 * Tenancy: every query filters by client_id AND the connection sets
 * `app.client_id` so Row-Level Security applies as defense in depth
 * (docs/09 §4). The engine's math never runs in SQL — only aggregation does.
 */
export class PgAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  async load(
    clientId: string,
    entity: EntityRef,
    window: DateWindow,
    model: UnitEconomicsModel,
  ): Promise<AnalyticsInputs> {
    const client = await this.pool.connect();
    try {
      // Scope the transaction to the tenant (RLS + explicit filters).
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.client_id', $1, true)", [
        clientId,
      ]);

      const facts = await this.aggregateFacts(client, clientId, entity, window);
      const stages = await this.loadStages(client, model);
      const funnel = await this.funnelCounts(client, clientId, entity, window);
      const sales = await this.salesAggregate(
        client,
        clientId,
        entity,
        window,
        facts.currency,
      );

      await client.query("COMMIT");
      return { entity, window, facts, stages, funnel, sales, model };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  private async aggregateFacts(
    client: PoolClient,
    clientId: string,
    entity: EntityRef,
    window: DateWindow,
  ): Promise<FactAggregate> {
    const { rows } = await client.query(
      `SELECT
         COALESCE(SUM(spend_minor),0)::bigint            AS spend_minor,
         COALESCE(SUM(impressions),0)::bigint            AS impressions,
         COALESCE(SUM(clicks),0)::bigint                 AS clicks,
         COALESCE(SUM(conversions),0)::numeric           AS conversions,
         COALESCE(SUM(conversion_value_minor),0)::bigint AS conversion_value_minor,
         COALESCE(MAX(currency),'')                      AS currency
       FROM facts.entity_daily
       WHERE client_id=$1 AND entity_type=$2 AND entity_id=$3
         AND date BETWEEN $4 AND $5`,
      [clientId, entity.type, entity.id, window.start, window.end],
    );
    const r = rows[0];
    return {
      currency: r.currency || "XXX",
      spend_minor: Number(r.spend_minor),
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      conversions: Number(r.conversions),
      conversion_value_minor: Number(r.conversion_value_minor),
    };
  }

  private async loadStages(
    client: PoolClient,
    _model: UnitEconomicsModel,
  ): Promise<StageDef[]> {
    // For M1 the Health Tourism funnel is seeded; a later milestone maps model →
    // vertical node explicitly. Empty result is valid (no CRM funnel yet).
    const { rows } = await client.query(
      `SELECT key, label, ordinal FROM crm.funnel_stage ORDER BY ordinal`,
    );
    return rows.map((r) => ({
      key: r.key,
      label: r.label,
      ordinal: Number(r.ordinal),
    }));
  }

  private async funnelCounts(
    client: PoolClient,
    clientId: string,
    entity: EntityRef,
    window: DateWindow,
  ): Promise<FunnelCounts> {
    const { rows } = await client.query(
      `SELECT s.key AS key, COUNT(DISTINCT fe.lead_id)::bigint AS n
       FROM crm.funnel_event fe
       JOIN crm.funnel_stage s ON s.id = fe.stage_id
       JOIN crm.lead l ON l.id = fe.lead_id
       WHERE fe.client_id=$1
         AND l.attributed_entity_type=$2 AND l.attributed_entity_id=$3
         AND fe.occurred_at::date BETWEEN $4 AND $5
       GROUP BY s.key`,
      [clientId, entity.type, entity.id, window.start, window.end],
    );
    const out: FunnelCounts = {};
    for (const r of rows) out[r.key] = Number(r.n);
    return out;
  }

  private async salesAggregate(
    client: PoolClient,
    clientId: string,
    entity: EntityRef,
    window: DateWindow,
    currency: string,
  ): Promise<SalesAggregate> {
    const { rows } = await client.query(
      `SELECT COUNT(*)::bigint AS n,
              COALESCE(SUM(sa.revenue_minor),0)::bigint AS revenue_minor,
              SUM(sa.margin_minor)::bigint AS margin_minor
       FROM crm.sale sa
       JOIN crm.lead l ON l.id = sa.lead_id
       WHERE sa.client_id=$1
         AND l.attributed_entity_type=$2 AND l.attributed_entity_id=$3
         AND sa.occurred_at::date BETWEEN $4 AND $5`,
      [clientId, entity.type, entity.id, window.start, window.end],
    );
    const r = rows[0];
    return {
      count: Number(r.n),
      revenue_minor: Number(r.revenue_minor),
      margin_minor: r.margin_minor == null ? null : Number(r.margin_minor),
      currency,
    };
  }
}
