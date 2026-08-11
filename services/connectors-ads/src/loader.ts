import type { NormalizedSync, EntityDailyFact } from "@rtnads/contracts";

/**
 * Warehouse loader: turns a validated NormalizedSync into an idempotent upsert
 * script for core.* and facts.* (the L1→L2 boundary). FKs are resolved by
 * external_id via subselects, so the same sync can be replayed to identical
 * warehouse state (docs/08 §4 — replay reproduces identical facts).
 *
 * This emits SQL text (dependency-free). A pg-client-based executor can wrap it
 * later without changing the mapping or the SQL shape.
 */

function lit(v: string | number | null): string {
  if (v === null) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

function factEntityIdSubselect(f: EntityDailyFact, platform: string): string {
  const ext = lit(f.entity_external_id);
  switch (f.entity_type) {
    case "account":
      return `(SELECT a.id FROM core.ad_account a
               JOIN core.platform p ON p.id=a.platform_id
               WHERE a.external_id=${ext} AND p.key=${lit(platform)})`;
    case "campaign":
      return `(SELECT id FROM core.campaign WHERE external_id=${ext})`;
    case "ad_set":
      return `(SELECT id FROM core.ad_set WHERE external_id=${ext})`;
    case "ad":
      return `(SELECT id FROM core.ad WHERE external_id=${ext})`;
    case "creative":
      return `(SELECT id FROM core.creative WHERE external_id=${ext})`;
  }
}

/** Build the full upsert script for a sync, wrapped in a transaction. */
export function buildUpsertSql(sync: NormalizedSync): string {
  const cid = lit(sync.client_id);
  const platform = sync.account.platform;
  const out: string[] = ["BEGIN;"];

  // ── account ────────────────────────────────────────────────────────────────
  const a = sync.account;
  out.push(
    `INSERT INTO core.ad_account (client_id, platform_id, external_id, name, currency, timezone, maturity, status)
     SELECT ${cid}, p.id, ${lit(a.external_id)}, ${lit(a.name)}, ${lit(a.currency)}, ${lit(a.timezone)}, ${lit(a.maturity)}, ${lit(a.status)}
     FROM core.platform p WHERE p.key=${lit(platform)}
     ON CONFLICT (platform_id, external_id) DO UPDATE
       SET name=EXCLUDED.name, currency=EXCLUDED.currency, timezone=EXCLUDED.timezone,
           maturity=EXCLUDED.maturity, status=EXCLUDED.status;`,
  );

  // ── campaigns ───────────────────────────────────────────────────────────────
  for (const c of sync.campaigns) {
    out.push(
      `INSERT INTO core.campaign (client_id, ad_account_id, external_id, name, objective, status, maturity)
       SELECT ${cid}, a.id, ${lit(c.external_id)}, ${lit(c.name)}, ${lit(c.objective)}, ${lit(c.status)}, ${lit(c.maturity)}
       FROM core.ad_account a JOIN core.platform p ON p.id=a.platform_id
       WHERE a.external_id=${lit(c.account_external_id)} AND p.key=${lit(platform)}
       ON CONFLICT (ad_account_id, external_id) DO UPDATE
         SET name=EXCLUDED.name, objective=EXCLUDED.objective, status=EXCLUDED.status, maturity=EXCLUDED.maturity;`,
    );
  }

  // ── creatives ───────────────────────────────────────────────────────────────
  for (const cr of sync.creatives) {
    out.push(
      `INSERT INTO core.creative (client_id, external_id, format, asset_ref)
       VALUES (${cid}, ${lit(cr.external_id)}, ${lit(cr.format)}, ${lit(cr.asset_ref)})
       ON CONFLICT (client_id, external_id) DO NOTHING;`,
    );
  }

  // ── ad sets ─────────────────────────────────────────────────────────────────
  for (const s of sync.ad_sets) {
    out.push(
      `INSERT INTO core.ad_set (client_id, campaign_id, external_id, name, status, budget_minor, budget_type)
       SELECT ${cid}, c.id, ${lit(s.external_id)}, ${lit(s.name)}, ${lit(s.status)}, ${lit(s.budget_minor)}, ${lit(s.budget_type)}
       FROM core.campaign c WHERE c.external_id=${lit(s.campaign_external_id)}
       ON CONFLICT (campaign_id, external_id) DO UPDATE
         SET name=EXCLUDED.name, status=EXCLUDED.status, budget_minor=EXCLUDED.budget_minor, budget_type=EXCLUDED.budget_type;`,
    );
  }

  // ── ads ─────────────────────────────────────────────────────────────────────
  for (const ad of sync.ads) {
    const creativeJoin =
      ad.creative_external_id != null
        ? `LEFT JOIN core.creative cr ON cr.external_id=${lit(ad.creative_external_id)} AND cr.client_id=${cid}`
        : "";
    const creativeCol = ad.creative_external_id != null ? "cr.id" : "NULL";
    out.push(
      `INSERT INTO core.ad (client_id, ad_set_id, creative_id, external_id, name, status)
       SELECT ${cid}, s.id, ${creativeCol}, ${lit(ad.external_id)}, ${lit(ad.name)}, ${lit(ad.status)}
       FROM core.ad_set s ${creativeJoin}
       WHERE s.external_id=${lit(ad.ad_set_external_id)}
       ON CONFLICT (ad_set_id, external_id) DO UPDATE
         SET name=EXCLUDED.name, status=EXCLUDED.status, creative_id=EXCLUDED.creative_id;`,
    );
  }

  // ── facts ───────────────────────────────────────────────────────────────────
  for (const f of sync.facts) {
    out.push(
      `INSERT INTO facts.entity_daily
         (client_id, entity_type, entity_id, date, currency, spend_minor, impressions, clicks, conversions, conversion_value_minor, platform_metrics, data_quality)
       SELECT ${cid}, ${lit(f.entity_type)}, ${factEntityIdSubselect(f, platform)}, ${lit(f.date)}, ${lit(f.currency)},
              ${lit(f.spend_minor)}, ${lit(f.impressions)}, ${lit(f.clicks)}, ${lit(f.conversions)}, ${lit(f.conversion_value_minor)},
              ${lit(JSON.stringify(f.platform_metrics))}::jsonb, ${lit(JSON.stringify(f.data_quality))}::jsonb
       WHERE ${factEntityIdSubselect(f, platform)} IS NOT NULL
       ON CONFLICT (client_id, entity_type, entity_id, date) DO UPDATE
         SET spend_minor=EXCLUDED.spend_minor, impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks,
             conversions=EXCLUDED.conversions, conversion_value_minor=EXCLUDED.conversion_value_minor,
             platform_metrics=EXCLUDED.platform_metrics, data_quality=EXCLUDED.data_quality;`,
    );
  }

  out.push("COMMIT;");
  return out.join("\n");
}
