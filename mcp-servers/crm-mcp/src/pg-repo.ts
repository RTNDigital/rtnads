import type { Pool } from "pg";
import type { EntityRef } from "@rtnads/contracts";
import type {
  CrmRepository,
  DateWindow,
  LeadQualityDistribution,
  FunnelConversion,
  SalesOutcomes,
} from "./types.js";

/**
 * Postgres-backed anonymized CRM reads. Queries crm.* by advertising attribution
 * and returns only aggregates/bands — never a lead's pseudonym or any PII.
 * Tenant-scoped via client_id + app.client_id (RLS defense in depth).
 */
export class PgCrmRepository implements CrmRepository {
  constructor(private readonly pool: Pool) {}

  async leadQualityDistribution(clientId: string, entity: EntityRef, w: DateWindow): Promise<LeadQualityDistribution> {
    const { rows } = await this.pool.query(
      `SELECT COALESCE(lead_quality,'unknown') AS band, count(*)::int AS n
         FROM crm.lead
        WHERE client_id=$1 AND attributed_entity_type=$2 AND attributed_entity_id=$3
          AND created_at::date BETWEEN $4 AND $5
        GROUP BY 1`,
      [clientId, entity.type, entity.id, w.start, w.end],
    );
    const total = rows.reduce((s, r) => s + r.n, 0);
    const qualified = rows.filter((r) => r.band === "mid" || r.band === "high").reduce((s, r) => s + r.n, 0);
    return {
      bands: rows.map((r) => ({ band: r.band, count: r.n, share: total > 0 ? r.n / total : 0 })),
      qualification_rate: total > 0 ? qualified / total : 0,
      sample_size: total,
    };
  }

  async funnelConversion(clientId: string, entity: EntityRef, w: DateWindow): Promise<FunnelConversion> {
    const { rows } = await this.pool.query(
      `SELECT s.key AS key, s.ordinal AS ordinal, count(DISTINCT fe.lead_id)::int AS n
         FROM crm.funnel_event fe
         JOIN crm.funnel_stage s ON s.id=fe.stage_id
         JOIN crm.lead l ON l.id=fe.lead_id
        WHERE fe.client_id=$1 AND l.attributed_entity_type=$2 AND l.attributed_entity_id=$3
          AND fe.occurred_at::date BETWEEN $4 AND $5
        GROUP BY s.key, s.ordinal ORDER BY s.ordinal`,
      [clientId, entity.type, entity.id, w.start, w.end],
    );
    const stages = [];
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!;
      const cur = rows[i]!;
      stages.push({ from: prev.key, to: cur.key, rate: prev.n > 0 ? cur.n / prev.n : 0, n: prev.n });
    }
    const first = rows[0]?.n ?? 0;
    const last = rows[rows.length - 1]?.n ?? 0;
    return { stages, overall_lead_to_sale: first > 0 ? last / first : null };
  }

  async salesOutcomes(clientId: string, entity: EntityRef, w: DateWindow): Promise<SalesOutcomes> {
    const agg = await this.pool.query(
      `SELECT count(*)::int AS n, COALESCE(SUM(sa.revenue_minor),0)::bigint AS revenue, COALESCE(MAX(sa.currency),'GBP') AS currency
         FROM crm.sale sa JOIN crm.lead l ON l.id=sa.lead_id
        WHERE sa.client_id=$1 AND l.attributed_entity_type=$2 AND l.attributed_entity_id=$3
          AND sa.occurred_at::date BETWEEN $4 AND $5`,
      [clientId, entity.type, entity.id, w.start, w.end],
    );
    const byq = await this.pool.query(
      `SELECT COALESCE(sa.sales_quality,'unknown') AS band, count(*)::int AS n
         FROM crm.sale sa JOIN crm.lead l ON l.id=sa.lead_id
        WHERE sa.client_id=$1 AND l.attributed_entity_type=$2 AND l.attributed_entity_id=$3
          AND sa.occurred_at::date BETWEEN $4 AND $5
        GROUP BY 1`,
      [clientId, entity.type, entity.id, w.start, w.end],
    );
    const n = agg.rows[0].n;
    const revenue = Number(agg.rows[0].revenue);
    return {
      sales: n,
      revenue_minor: revenue,
      currency: agg.rows[0].currency,
      avg_order_value_minor: n > 0 ? Math.round(revenue / n) : null,
      sales_quality: byq.rows.map((r) => ({ band: r.band, count: r.n })),
    };
  }
}
