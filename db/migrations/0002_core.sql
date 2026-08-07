-- 0002 — canonical advertising entities (docs/03-database-model.md §core)
-- Surrogate uuid PKs; external platform ids stored separately, never used as keys.

CREATE TABLE IF NOT EXISTS core.platform (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,      -- 'meta', 'google', 'tiktok'
  display_name text NOT NULL
);

INSERT INTO core.platform (key, display_name) VALUES
  ('meta', 'Meta'), ('google', 'Google'), ('tiktok', 'TikTok')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS core.ad_account (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES core.platform(id),
  external_id text NOT NULL,
  name        text NOT NULL,
  currency    text NOT NULL,
  timezone    text NOT NULL DEFAULT 'UTC',
  maturity    text NOT NULL DEFAULT 'new',   -- new | ramping | mature
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform_id, external_id)
);
CREATE INDEX IF NOT EXISTS ad_account_client_idx ON core.ad_account (client_id);

CREATE TABLE IF NOT EXISTS core.campaign (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  ad_account_id uuid NOT NULL REFERENCES core.ad_account(id) ON DELETE CASCADE,
  external_id   text NOT NULL,
  name          text NOT NULL,
  objective     text,
  status        text NOT NULL DEFAULT 'active',
  maturity      text NOT NULL DEFAULT 'learning',  -- learning | stabilizing | mature
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  raw_ref       uuid,
  UNIQUE (ad_account_id, external_id)
);
CREATE INDEX IF NOT EXISTS campaign_client_idx ON core.campaign (client_id);
CREATE INDEX IF NOT EXISTS campaign_account_idx ON core.campaign (ad_account_id);

CREATE TABLE IF NOT EXISTS core.ad_set (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES core.campaign(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  targeting   jsonb NOT NULL DEFAULT '{}',
  budget_minor bigint,
  budget_type text,                              -- daily | lifetime
  schedule    jsonb NOT NULL DEFAULT '{}',
  maturity    text NOT NULL DEFAULT 'learning',
  UNIQUE (campaign_id, external_id)
);
CREATE INDEX IF NOT EXISTS ad_set_client_idx ON core.ad_set (client_id);
CREATE INDEX IF NOT EXISTS ad_set_campaign_idx ON core.ad_set (campaign_id);

CREATE TABLE IF NOT EXISTS core.creative (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  external_id text,
  format      text,                              -- video | image | carousel | ugc
  asset_ref   text,
  fingerprint text,
  -- embedding vector(1024)  -- enabled with pgvector in a later milestone
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creative_client_idx ON core.creative (client_id);

CREATE TABLE IF NOT EXISTS core.ad (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  ad_set_id   uuid NOT NULL REFERENCES core.ad_set(id) ON DELETE CASCADE,
  creative_id uuid REFERENCES core.creative(id),
  external_id text NOT NULL,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  UNIQUE (ad_set_id, external_id)
);
CREATE INDEX IF NOT EXISTS ad_client_idx ON core.ad (client_id);
CREATE INDEX IF NOT EXISTS ad_ad_set_idx ON core.ad (ad_set_id);

-- ── ingest landing zone (raw, replayable) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS ingest.sync_run (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector    text NOT NULL,
  client_id    uuid REFERENCES iam.client(id) ON DELETE SET NULL,
  window_start timestamptz,
  window_end   timestamptz,
  status       text NOT NULL DEFAULT 'running', -- running|success|failed|partial
  stats        jsonb NOT NULL DEFAULT '{}',
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);

CREATE TABLE IF NOT EXISTS ingest.raw_payload (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text NOT NULL,        -- 'meta' | 'crm:hubspot' | ...
  entity_kind  text NOT NULL,        -- 'campaign' | 'insight' | 'lead' | ...
  external_ref text,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  payload      jsonb NOT NULL,
  checksum     text NOT NULL,        -- dedupe / idempotency
  sync_run_id  uuid REFERENCES ingest.sync_run(id) ON DELETE SET NULL,
  UNIQUE (source, entity_kind, checksum)
);
CREATE INDEX IF NOT EXISTS raw_payload_kind_idx ON ingest.raw_payload (source, entity_kind);
