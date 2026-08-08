import type { NormalizedCrmSync } from "@rtnads/contracts";

/**
 * CRM warehouse loader: pseudonymized rows → crm.* upserts. Leads are keyed by
 * (client_id, pseudonym_id); attribution and funnel stages are resolved by
 * lookup. Idempotent via the natural-key constraints from migration 0007.
 *
 * Emits SQL text (dependency-free), mirroring the ads loader.
 */

function lit(v: string | number | null): string {
  if (v === null) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

function attributionSubselect(
  cid: string,
  type: string | null,
  ext: string | null,
): string {
  if (!type || !ext) return "NULL";
  const e = lit(ext);
  switch (type) {
    case "campaign":
      return `(SELECT id FROM core.campaign WHERE external_id=${e} AND client_id=${cid})`;
    case "ad_set":
      return `(SELECT id FROM core.ad_set WHERE external_id=${e} AND client_id=${cid})`;
    case "ad":
      return `(SELECT id FROM core.ad WHERE external_id=${e} AND client_id=${cid})`;
    case "account":
      return `(SELECT id FROM core.ad_account WHERE external_id=${e} AND client_id=${cid})`;
    default:
      return "NULL";
  }
}

export function buildCrmUpsertSql(sync: NormalizedCrmSync): string {
  const cid = lit(sync.client_id);
  const vpath = lit(sync.vertical_path);
  const out: string[] = ["BEGIN;"];

  // ── leads ───────────────────────────────────────────────────────────────────
  for (const l of sync.leads) {
    out.push(
      `INSERT INTO crm.lead (client_id, pseudonym_id, attributed_entity_type, attributed_entity_id, source_platform, created_at, lead_quality, attributes)
       VALUES (${cid}, ${lit(l.pseudonym_id)}, ${lit(l.attributed_entity_type)},
               ${attributionSubselect(cid, l.attributed_entity_type, l.attributed_external_id)},
               ${lit(l.source_platform)}, ${lit(l.created_at)}, ${lit(l.lead_quality)}, ${lit(JSON.stringify(l.attributes))}::jsonb)
       ON CONFLICT (client_id, pseudonym_id) DO UPDATE
         SET attributed_entity_type=EXCLUDED.attributed_entity_type,
             attributed_entity_id=EXCLUDED.attributed_entity_id,
             lead_quality=EXCLUDED.lead_quality, attributes=EXCLUDED.attributes;`,
    );
  }

  // ── funnel events (resolve lead + stage) ─────────────────────────────────────
  for (const e of sync.events) {
    out.push(
      `INSERT INTO crm.funnel_event (client_id, lead_id, stage_id, occurred_at, value_minor)
       SELECT ${cid}, l.id, s.id, ${lit(e.occurred_at)}, ${lit(e.value_minor)}
       FROM crm.lead l
       JOIN crm.funnel_stage s ON s.key=${lit(e.stage_key)}
       JOIN taxonomy.node n ON n.id=s.vertical_node_id AND n.path=${vpath}
       WHERE l.client_id=${cid} AND l.pseudonym_id=${lit(e.pseudonym_id)}
       ON CONFLICT (client_id, lead_id, stage_id) DO NOTHING;`,
    );
  }

  // ── sales (resolve lead) ─────────────────────────────────────────────────────
  for (const s of sync.sales) {
    out.push(
      `INSERT INTO crm.sale (client_id, lead_id, occurred_at, revenue_minor, margin_minor, customer_value_minor, sales_quality, currency)
       SELECT ${cid}, l.id, ${lit(s.occurred_at)}, ${lit(s.revenue_minor)}, ${lit(s.margin_minor)}, ${lit(s.customer_value_minor)}, ${lit(s.sales_quality)}, ${lit(s.currency)}
       FROM crm.lead l
       WHERE l.client_id=${cid} AND l.pseudonym_id=${lit(s.pseudonym_id)}
       ON CONFLICT (client_id, lead_id, occurred_at) DO NOTHING;`,
    );
  }

  out.push("COMMIT;");
  return out.join("\n");
}
