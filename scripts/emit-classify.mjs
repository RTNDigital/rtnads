/**
 * Dev/CI helper: classify the RhinoUK sample campaign and print the context-vector
 * upsert SQL to stdout. Pipe into psql to land the classifications.
 *
 *   node scripts/emit-classify.mjs <client-uuid> | psql "$DATABASE_URL" -f -
 *
 * Requires a prior `pnpm build`. Campaign attributes mirror the ads fixture
 * (services/connectors-ads); market/country are supplied as ingested context.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distUrl = pathToFileURL(join(here, "../services/classifier/dist/index.js")).href;
const { classifyCampaign, buildClassificationUpsertSql } = await import(distUrl);

const clientId = process.argv[2];
if (!clientId) {
  console.error("usage: node scripts/emit-classify.mjs <client-uuid>");
  process.exit(1);
}

const assignments = classifyCampaign({
  campaign: { name: "Rhino-UK-Leads-Q3", objective: "OUTCOME_LEADS", maturity: "learning" },
  account: { platform: "meta", market: "uk", country: "uk" },
});
const sql = buildClassificationUpsertSql(
  { clientId, entityType: "campaign", externalId: "camp_2001" },
  assignments,
);
process.stdout.write(sql);
