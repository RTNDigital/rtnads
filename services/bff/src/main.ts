import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import pg from "pg";
import { PgQueryStore, PgControlOps, PgBffLearningStore } from "./pg.js";
import { startBffServer } from "./http.js";
import { makePrincipal } from "./index.js";
import { JwtVerifier, jwksResolver, bearerToken, principalFromClaims } from "./auth.js";
import type { Principal } from "./types.js";

/**
 * Dev entrypoint: serve the BFF + operator console over HTTP, backed by Postgres.
 *
 *   DATABASE_URL=… node dist/main.js
 *
 * Authentication (docs/06 §5, docs/09 §4):
 *   • production — set BFF_OIDC_ISSUER + BFF_OIDC_AUDIENCE and either
 *     BFF_JWT_HS256_SECRET (symmetric) or BFF_OIDC_JWKS_URI (RS256). Requests must
 *     carry `Authorization: Bearer <jwt>`; the principal (incl. tenant) comes from
 *     the verified token — never the client.
 *   • local demo — set BFF_DEV_PRINCIPAL=1 to resolve a fixed Optimizer principal
 *     (DEMO_CLIENT_ID) so the console works without an IdP.
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

const authenticate = buildAuthenticator(clientId);
const readiness = async () => {
  await pool.query("SELECT 1");
};
startBffServer({ deps, authenticate, port, readiness });

function buildAuthenticator(demoClientId: string): (req: IncomingMessage) => Principal | Promise<Principal> {
  if (process.env.BFF_DEV_PRINCIPAL === "1") {
    console.warn("BFF_DEV_PRINCIPAL=1 — auth disabled, resolving a fixed demo Optimizer principal");
    const demo = makePrincipal("user:operator", demoClientId, ["optimizer"]);
    return () => demo;
  }
  const issuer = process.env.BFF_OIDC_ISSUER;
  const audience = process.env.BFF_OIDC_AUDIENCE;
  if (!issuer || !audience) {
    console.error("Auth not configured: set BFF_OIDC_ISSUER + BFF_OIDC_AUDIENCE (and BFF_JWT_HS256_SECRET or BFF_OIDC_JWKS_URI), or BFF_DEV_PRINCIPAL=1 for the demo.");
    process.exit(1);
  }
  const verifier = new JwtVerifier({
    issuer,
    audience,
    ...(process.env.BFF_JWT_HS256_SECRET ? { hs256Secret: process.env.BFF_JWT_HS256_SECRET } : {}),
    ...(process.env.BFF_OIDC_JWKS_URI ? { jwks: jwksResolver(process.env.BFF_OIDC_JWKS_URI) } : {}),
    ...(process.env.BFF_OIDC_CLIENT_ID_CLAIM ? { clientIdClaim: process.env.BFF_OIDC_CLIENT_ID_CLAIM } : {}),
    ...(process.env.BFF_OIDC_ROLES_CLAIM ? { rolesClaim: process.env.BFF_OIDC_ROLES_CLAIM } : {}),
  });
  return async (req: IncomingMessage) => {
    const token = bearerToken(req.headers.authorization);
    return principalFromClaims(await verifier.verify(token));
  };
}
