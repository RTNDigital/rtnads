-- 0001 — schemas, extensions, and IAM
-- See docs/03-database-model.md. Idempotent where practical.

-- gen_random_uuid() is in PostgreSQL core since v13 — no extension required.
-- (If a deployment needs additional pgcrypto functions, enable it out-of-band.)

-- Logical schemas mirror the bounded contexts (docs/02, docs/03).
CREATE SCHEMA IF NOT EXISTS ingest;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS facts;
CREATE SCHEMA IF NOT EXISTS taxonomy;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS iam;

-- ── iam ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iam.client (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'active',
  settings   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS iam."user" (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS iam.role (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);

-- A user holds a role per client (tenancy scoping lives here).
CREATE TABLE IF NOT EXISTS iam.membership (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES iam."user"(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  role      text NOT NULL,
  UNIQUE (user_id, client_id, role)
);

CREATE TABLE IF NOT EXISTS iam.permission (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id     uuid NOT NULL REFERENCES iam.role(id) ON DELETE CASCADE,
  capability  text NOT NULL,
  constraints jsonb NOT NULL DEFAULT '{}'
);

-- Seed the canonical roles (docs/10-permission-model.md §1).
INSERT INTO iam.role (key, description) VALUES
  ('viewer',          'Read-only dashboards and recommendations'),
  ('analyst',         'Read cohorts, evidence and audit'),
  ('optimizer',       'Approve/reject recommendations; trigger execution'),
  ('client_admin',    'All for their client; edit their optimization policy'),
  ('platform_admin',  'Cross-client; edit global and per-client policy'),
  ('auditor',         'Read-only incl. full audit chain'),
  ('ai_orchestrator', 'Draft recommendations; no approve/execute/configure')
ON CONFLICT (key) DO NOTHING;
