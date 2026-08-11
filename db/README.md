# Database

Physical implementation of [docs/03-database-model.md](../docs/03-database-model.md).
PostgreSQL, organized into logical schemas that mirror the bounded contexts.

## Layout

```
db/
├─ migrations/     versioned, forward-only SQL (applied in lexical order)
│  ├─ 0001_schemas_and_iam.sql
│  ├─ 0002_core.sql
│  ├─ 0003_facts.sql
│  ├─ 0004_taxonomy.sql
│  ├─ 0005_crm.sql
│  └─ 0006_rls.sql          row-level security (tenancy, fails closed)
├─ seed/           idempotent reference data (taxonomy, dimensions, funnel)
│  └─ 0001_taxonomy.sql
├─ migrate.ts      dependency-free runner (psql), tracks schema_migrations
└─ seed.ts         seed runner
```

## Apply

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/rtnads
pnpm db:migrate     # applies pending migrations, records them
pnpm db:seed        # loads reference data (safe to re-run)
```

`gen_random_uuid()` is used for surrogate keys — it is in PostgreSQL core since
v13, so **no extension is required**.

## Tenancy (RLS)

Tenant-scoped tables enable **and force** row-level security. The application
connects as the `rtnads_app` role and sets the tenant per transaction:

```sql
SET LOCAL app.client_id = '<client-uuid>';   -- derived from the session principal
```

`app.current_client_id()` returns `NULL` when unset, so an **unscoped connection
sees no rows** (fail-closed) — never all rows. `client_id` is never taken from a
request body (see [docs/09](../docs/09-security-model.md) §4,
[docs/06](../docs/06-api-boundaries.md) §5).

## Verification

Migrations, seed and RLS isolation are verified end-to-end in CI. The check
applies every migration + seed to a throwaway Postgres, asserts the seed counts,
and proves that two clients see only their own rows while an unscoped connection
sees none. See [docs/14-testing-strategy.md](../docs/14-testing-strategy.md) §3.

## Conventions

- Surrogate `uuid` PKs; external platform ids stored separately, never used as keys.
- Money in **minor units** + explicit `currency`.
- Timestamps are `timestamptz` in UTC.
- Migrations are forward-only and idempotent where practical (`IF NOT EXISTS`,
  `ON CONFLICT DO NOTHING`).
