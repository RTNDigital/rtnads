# Deploying RTN Ads Intelligence

The repository ships a container image and a Compose file that stand up the exact
system shown in the operator console: Postgres + the BFF, with the schema applied,
reference data seeded, a demo warehouse loaded, and a real recommendation derived
by the deterministic pipeline (analytics → benchmark → decision → orchestrator).

## Quick start (demo)

```bash
docker compose up --build
# → operator console at http://localhost:8787
```

First boot: the BFF waits for the database, applies the 12 migrations + RLS, seeds
taxonomy/knowledge, loads the demo warehouse for client
`cccccccc-0000-0000-0000-000000000001`, and derives a `budget_increase`
recommendation. Every step is idempotent, so restarts are safe. Data persists in
the `pgdata` volume.

The demo runs with a fixed **Optimizer** principal (`BFF_DEV_PRINCIPAL=1`) so the
console works without an identity provider.

## Going to production

Two changes to `docker-compose.yml` (or your `.env` — see `deploy/.env.example`):

1. **Turn off the demo:** set `DEMO_SEED=0` and remove `BFF_DEV_PRINCIPAL`.
2. **Configure auth (OIDC/JWT):** set `BFF_OIDC_ISSUER` + `BFF_OIDC_AUDIENCE` and
   either `BFF_OIDC_JWKS_URI` (RS256) or `BFF_JWT_HS256_SECRET` (HS256). Requests
   then require `Authorization: Bearer <jwt>`; the principal **and tenant** come
   from the verified token, never from the client (docs/06 §5, docs/09 §4).

Point `DATABASE_URL` at a managed Postgres (RDS / Cloud SQL / Azure Database) and
apply the schema once with the same entrypoint, or run `db/migrate.ts` +
`db/seed.ts` as a one-off job.

### Real ad-platform data & writes

- **Reads:** replace the `emit-*` fixtures with a live sync —
  `node scripts/ingest-meta.mjs <client-uuid> <start> <end>` against a real Meta
  account (credentials via env, held only at the L1 connector — docs/09 §2).
- **Writes:** an approved, policy-passed action is applied by the Action Executor
  through the Meta write connector (`@rtnads/connectors-ads`). Provide the account
  credentials to that boundary; without them, approved actions stay recorded and
  audited but are not pushed to the platform.

### LLM provider

Narratives are authored behind the model-agnostic boundary (ADR-0003). The demo
uses the deterministic offline provider; switch to the real Claude adapter by
configuration — set `ANTHROPIC_API_KEY` (and optionally `LLM_MODEL`) and wire
`@rtnads/llm-claude`'s `claudeProviderFromEnv()` into the orchestrator's
composition root. No core code changes.

## Health probes

The BFF exposes two unauthenticated endpoints for orchestrators and load balancers:

| Path | Meaning | Use for |
|---|---|---|
| `GET /healthz` | Process is up (always 200) | liveness probe / container healthcheck |
| `GET /readyz` | Dependencies usable — 200, or 503 when the database is unreachable | readiness probe / gating traffic |

Compose wires `/healthz` as the `bff` container healthcheck. On Kubernetes, map
`/healthz` to `livenessProbe` and `/readyz` to `readinessProbe`:

```yaml
livenessProbe:
  httpGet: { path: /healthz, port: 8787 }
readinessProbe:
  httpGet: { path: /readyz, port: 8787 }
  initialDelaySeconds: 20
```

## What runs where

| Component | Container | Notes |
|---|---|---|
| Postgres | `db` | schema, RLS, control plane, warehouse |
| BFF + console | `bff` | HTTP API + static console at `/` |
| Migrate / seed / demo load | `bff` entrypoint | idempotent, on every boot |

The L3 engines, MCP servers, and Action Executor are libraries invoked in-process
by the pipeline and BFF; scale them out as separate services later without
changing the contracts.
