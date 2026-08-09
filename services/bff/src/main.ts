import { randomUUID } from "node:crypto";
import pg from "pg";
import { PgQueryStore, PgControlOps, PgBffLearningStore } from "./pg.js";
import { startBffServer } from "./http.js";
import { makePrincipal } from "./index.js";

/**
 * Dev entrypoint: serve the BFF + operator console over HTTP, backed by Postgres.
 *
 *   DATABASE_URL=… DEMO_CLIENT_ID=… node dist/main.js
 *
 * The demo resolves a fixed Optimizer principal (production uses OIDC sessions).
 * Credentials come from the environment — never from the client (docs/09 §2).
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const clientId = process.env.DEMO_CLIENT_ID ?? "cccccccc-0000-0000-0000-000000000001";
const port = Number(process.env.PORT ?? 8787);

const pool = new pg.Pool({ connectionString: url });
const deps = {
  query: new PgQueryStore(pool),
  control: new PgControlOps(pool, () => new Date().toISOString(), () => randomUUID()),
  learning: new PgBffLearningStore(pool, () => new Date().toISOString(), () => randomUUID()),
};
const principal = makePrincipal("user:operator", clientId, ["optimizer"]);

startBffServer({ deps, resolvePrincipal: () => principal, port });
