#!/usr/bin/env sh
# Container entrypoint: wait for Postgres, apply schema + seed, optionally load a
# demo warehouse and derive a recommendation, then serve the BFF + console.
# Uses `psql` throughout — the same dependency-free path as CI and db/migrate.ts.
# All steps are idempotent (migrations tracked; loads use upserts), so a restart
# is safe. Configure via env — see DEPLOY.md / deploy/.env.example.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

echo "› waiting for database…"
i=0
until pg_isready -d "$DATABASE_URL" -q; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "database not reachable after 60s" >&2
    exit 1
  fi
  sleep 1
done

echo "› applying migrations…"
node --experimental-strip-types db/migrate.ts

echo "› applying seed (taxonomy + knowledge)…"
node --experimental-strip-types db/seed.ts

if [ "$DEMO_SEED" = "1" ]; then
  CID="${DEMO_CLIENT_ID:-cccccccc-0000-0000-0000-000000000001}"
  echo "› DEMO_SEED=1 — loading demo warehouse for client $CID…"
  # Register the tenant, then load the read-paths (ads → classify → historical → crm).
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
    -c "INSERT INTO iam.client (id, name) VALUES ('$CID','RhinoUK') ON CONFLICT DO NOTHING;"
  node scripts/emit-sync.mjs "$CID"       | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f -
  node scripts/emit-classify.mjs "$CID"   | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f -
  node scripts/emit-historical.mjs "$CID" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f -
  node scripts/emit-crm.mjs "$CID"        | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f -
  echo "› deriving a recommendation via the deterministic pipeline…"
  ( cd services/bff && node scripts/seed-recommendation.mjs "$CID" ) \
    || echo "  (no candidate recommendation — within expected)"
fi

echo "› starting BFF on :${PORT:-8787}"
exec node services/bff/dist/main.js
