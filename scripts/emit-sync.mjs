/**
 * Dev/CI helper: run the Meta connector against its fixtures and print the
 * normalized upsert SQL to stdout. Pipe into psql to land it in the warehouse.
 *
 *   node scripts/emit-sync.mjs <client-uuid> | psql "$DATABASE_URL" -f -
 *
 * Requires a prior `pnpm build` (imports the built package by relative path so
 * it needs no root dependency wiring).
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distUrl = pathToFileURL(
  join(here, "../services/connectors-ads/dist/index.js"),
).href;
const { MetaConnector, FixtureMetaSource, buildUpsertSql } = await import(distUrl);

const clientId = process.argv[2];
if (!clientId) {
  console.error("usage: node scripts/emit-sync.mjs <client-uuid>");
  process.exit(1);
}

const connector = new MetaConnector(new FixtureMetaSource());
const sync = await connector.pull({
  client_id: clientId,
  account_external_id: "act_1001",
  window: { start: "2026-07-01", end: "2026-07-01" },
});
process.stdout.write(buildUpsertSql(sync));
