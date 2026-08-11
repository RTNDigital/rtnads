/**
 * Dev/CI helper: load a small set of HISTORICAL campaigns (facts + context
 * classifications) so the Benchmark Engine has a real cohort to work with.
 * Prints upsert SQL to stdout; pipe into psql.
 *
 *   node scripts/emit-historical.mjs <client-uuid> | psql "$DATABASE_URL" -f -
 *
 * Three comparable rhinoplasty/UK/Meta campaigns (one stale) + one dissimilar
 * dental/DE/Google campaign that should fall below the similarity floor.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const adsDist = pathToFileURL(join(here, "../services/connectors-ads/dist/index.js")).href;
const clsDist = pathToFileURL(join(here, "../services/classifier/dist/index.js")).href;
const { buildUpsertSql } = await import(adsDist);
const { classifyCampaign, buildClassificationUpsertSql } = await import(clsDist);

const clientId = process.argv[2];
if (!clientId) {
  console.error("usage: node scripts/emit-historical.mjs <client-uuid>");
  process.exit(1);
}

const HIST = [
  { ext: "camp_hist_a", name: "Rhino-Hist-A", spend: 300000, conv: 100, date: "2026-07-01", rawObjective: "OUTCOME_LEADS", explicit: { market: "uk", country: "uk", budget_range: "mid" } },
  { ext: "camp_hist_b", name: "Rhino-Hist-B", spend: 450000, conv: 100, date: "2026-07-01", rawObjective: "OUTCOME_LEADS", explicit: { market: "uk", country: "uk", budget_range: "mid" } },
  { ext: "camp_hist_c", name: "Rhino-Hist-C", spend: 900000, conv: 100, date: "2026-01-15", rawObjective: "OUTCOME_LEADS", explicit: { market: "uk", country: "uk", budget_range: "mid" } },
  { ext: "camp_hist_d", name: "Dental-Hist-D", spend: 200000, conv: 100, date: "2026-07-01", rawObjective: "OUTCOME_SALES", explicit: { market: "de", country: "de", platform: "google", vertical: "health-tourism", subcategory: "health-tourism/dental", objective: "sales", conversion_type: "purchase", budget_range: "high" } },
];

// Build a normalized sync (account + historical campaigns + campaign-level facts).
const sync = {
  client_id: clientId,
  account: { platform: "meta", external_id: "act_1001", name: "RhinoUK Clinic — Meta", currency: "GBP", timezone: "Europe/London", maturity: "mature", status: "active" },
  campaigns: HIST.map((h) => ({ account_external_id: "act_1001", external_id: h.ext, name: h.name, objective: h.rawObjective, status: "active", maturity: "mature" })),
  ad_sets: [],
  ads: [],
  creatives: [],
  facts: HIST.map((h) => ({
    entity_type: "campaign", entity_external_id: h.ext, date: h.date, currency: "GBP",
    spend_minor: h.spend, impressions: h.conv * 40, clicks: h.conv * 3, conversions: h.conv,
    conversion_value_minor: 0, platform_metrics: {}, data_quality: { source: "fixture", complete: true },
  })),
};

let sql = buildUpsertSql(sync) + "\n";

for (const h of HIST) {
  const assignments = classifyCampaign({
    campaign: { name: h.name, objective: h.rawObjective, maturity: "mature" },
    account: { platform: "meta", market: h.explicit.market, country: h.explicit.country },
    explicit: h.explicit,
  });
  sql += buildClassificationUpsertSql({ clientId, entityType: "campaign", externalId: h.ext }, assignments) + "\n";
}

process.stdout.write(sql);
