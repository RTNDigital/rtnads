/**
 * Live Meta ingest → normalized warehouse SQL.
 *
 *   META_ACCESS_TOKEN=… META_ACCOUNT_ID=act_123 \
 *     node scripts/ingest-meta.mjs <client-uuid> [since] [until] | psql "$DATABASE_URL" -f -
 *
 * Pulls a real Meta ad account via the Graph API and prints the normalized upsert
 * SQL (same loader as the fixtures). The access token is read from the environment
 * and lives only in this L1 boundary — it never reaches the SQL, logs or the LLM
 * (docs/09 §2). Requires a prior `pnpm build`.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = pathToFileURL(join(here, "../services/connectors-ads/dist/index.js")).href;
const { HttpMetaSource, MetaConnector, buildUpsertSql } = await import(dist);

const clientId = process.argv[2];
const since = process.argv[3] ?? "2026-07-01";
const until = process.argv[4] ?? "2026-07-31";
const token = process.env.META_ACCESS_TOKEN;
const account = process.env.META_ACCOUNT_ID;
if (!clientId || !token || !account) {
  console.error("usage: META_ACCESS_TOKEN=… META_ACCOUNT_ID=act_123 node scripts/ingest-meta.mjs <client-uuid> [since] [until]");
  process.exit(1);
}

const source = new HttpMetaSource({ accessToken: token });
const connector = new MetaConnector(source);
const sync = await connector.pull({ client_id: clientId, account_external_id: account, window: { start: since, end: until } });
process.stdout.write(buildUpsertSql(sync));
