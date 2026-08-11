# RTN Ads Intelligence — BFF + operator console, backed by Postgres.
# Multi-stage: install + build the pnpm workspace, then ship a runtime image that
# migrates/seeds on boot and serves the console. See DEPLOY.md.

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
# Copy the whole source (node_modules/dist excluded via .dockerignore) and build.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
# `psql` / `pg_isready` — the migration + seed + demo-load path shells out to them
# (dependency-free, same as CI). Only the client is needed, not a server.
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client \
  && rm -rf /var/lib/apt/lists/*
# Bring the fully installed + built workspace across (dist + node_modules + the
# db/scripts/public assets the entrypoint and console need).
COPY --from=build /app ./
RUN chmod +x deploy/entrypoint.sh
EXPOSE 8787
ENTRYPOINT ["./deploy/entrypoint.sh"]
