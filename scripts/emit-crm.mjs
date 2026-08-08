/**
 * Dev/CI helper: run the CRM connector against its fixtures and print the
 * pseudonymized upsert SQL to stdout. Pipe into psql to land it in crm.*.
 *
 *   node scripts/emit-crm.mjs <client-uuid> [salt] | psql "$DATABASE_URL" -f -
 *
 * Requires a prior `pnpm build`. The salt defaults to a test value; in
 * production it comes from the secrets vault and is never committed.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distUrl = pathToFileURL(
  join(here, "../services/connectors-crm/dist/index.js"),
).href;
const { GenericCrmConnector, FixtureCrmSource, buildCrmUpsertSql } =
  await import(distUrl);

const clientId = process.argv[2];
const salt = process.argv[3] ?? "test-salt-do-not-use-in-prod";
if (!clientId) {
  console.error("usage: node scripts/emit-crm.mjs <client-uuid> [salt]");
  process.exit(1);
}

const connector = new GenericCrmConnector("hubspot", new FixtureCrmSource(), {
  pseudonymSalt: salt,
});
const sync = await connector.pull({
  client_id: clientId,
  vertical_path: "health-tourism",
  window: { start: "2026-07-01", end: "2026-07-31" },
});
process.stdout.write(buildCrmUpsertSql(sync));
