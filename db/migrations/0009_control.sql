-- 0009 — Control plane: Decision Memory & tamper-evident audit (docs/03 §control).
-- Approvals, actions, immutable action records, outcome evaluations, policy
-- evaluations, and an append-only hash-chained audit log.

CREATE SCHEMA IF NOT EXISTS control;

CREATE TABLE IF NOT EXISTS control.approval (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  recommendation_id uuid,
  decided_by        text NOT NULL,
  decision          text NOT NULL,            -- approve | reject
  decided_at        timestamptz NOT NULL DEFAULT now(),
  note              text
);

CREATE TABLE IF NOT EXISTS control.action (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  recommendation_id uuid,
  approval_id       uuid REFERENCES control.approval(id) ON DELETE SET NULL,
  entity_type       text NOT NULL,
  entity_id         uuid NOT NULL,
  account_id        uuid NOT NULL,
  action_type       text NOT NULL,
  requested_change  jsonb NOT NULL DEFAULT '{}',
  policy_evaluation jsonb NOT NULL,
  status            text NOT NULL DEFAULT 'pending_approval',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS action_client_idx ON control.action (client_id);

CREATE TABLE IF NOT EXISTS control.policy_evaluation (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  recommendation_id uuid,
  policy_version    int NOT NULL,
  input             jsonb NOT NULL,
  decision          text NOT NULL,
  violated_constraints jsonb NOT NULL DEFAULT '[]',
  evaluated_at      timestamptz NOT NULL DEFAULT now()
);

-- Immutable: one record per executed action; post_state/result attached via link.
CREATE TABLE IF NOT EXISTS control.action_record (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  action_id         uuid NOT NULL REFERENCES control.action(id) ON DELETE CASCADE,
  pre_state         jsonb NOT NULL,
  executed_change   jsonb NOT NULL,
  post_state        jsonb,
  executed_at       timestamptz NOT NULL DEFAULT now(),
  executed_by       text NOT NULL,
  platform_response jsonb,
  rollback_ref      uuid,
  evaluation_window jsonb,
  result            text
);
CREATE INDEX IF NOT EXISTS action_record_action_idx ON control.action_record (action_id);

CREATE TABLE IF NOT EXISTS control.outcome_evaluation (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  action_record_id  uuid NOT NULL REFERENCES control.action_record(id) ON DELETE CASCADE,
  evaluated_at      timestamptz NOT NULL DEFAULT now(),
  "window"          jsonb NOT NULL,
  metrics_before    jsonb NOT NULL,
  metrics_after     jsonb NOT NULL,
  delta             jsonb NOT NULL,
  result            text NOT NULL,
  causal_confidence numeric NOT NULL
);

-- Append-only, hash-chained audit log.
CREATE TABLE IF NOT EXISTS control.audit_entry (
  seq         bigserial PRIMARY KEY,
  client_id   uuid,
  actor       text NOT NULL,
  actor_kind  text NOT NULL,           -- user | system | llm
  action      text NOT NULL,
  subject_ref text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  prev_hash   text NOT NULL,
  hash        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_entry_client_idx ON control.audit_entry (client_id, seq);

-- ── RLS (tenant isolation, fail-closed) ─────────────────────────────────────
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'control.approval', 'control.action', 'control.policy_evaluation',
    'control.action_record', 'control.outcome_evaluation'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s
         USING (client_id = app.current_client_id())
         WITH CHECK (client_id = app.current_client_id())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO rtnads_app', t);
  END LOOP;
END $$;

-- Audit is append-only for the app role: SELECT + INSERT, never UPDATE/DELETE.
ALTER TABLE control.audit_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.audit_entry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_tenant_read ON control.audit_entry;
CREATE POLICY audit_tenant_read ON control.audit_entry
  FOR SELECT USING (client_id IS NOT DISTINCT FROM app.current_client_id());
DROP POLICY IF EXISTS audit_tenant_insert ON control.audit_entry;
CREATE POLICY audit_tenant_insert ON control.audit_entry
  FOR INSERT WITH CHECK (client_id IS NOT DISTINCT FROM app.current_client_id());
GRANT USAGE ON SCHEMA control TO rtnads_app;
GRANT SELECT, INSERT ON control.audit_entry TO rtnads_app;
GRANT USAGE, SELECT ON SEQUENCE control.audit_entry_seq_seq TO rtnads_app;
