-- 0012 — Strategy Memory learning suggestions (docs/08 Flow E, docs/11 §9).
-- The learning loop produces calibration SUGGESTIONS, never automatic changes: an
-- outcome.evaluated roll-up lands here as 'pending' and a human accepts/rejects it.
-- Client-scoped and tenant-isolated (RLS, fail-closed), like optimization_policy.

CREATE TABLE IF NOT EXISTS knowledge.learning_suggestion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','rejected','superseded')),
  kind            text NOT NULL DEFAULT 'calibration',
  snapshot        jsonb NOT NULL,
  source_event_id uuid,
  note            text,
  decided_by      text,
  decided_at      timestamptz
);

-- At most one pending suggestion per client — the latest snapshot supersedes older ones.
CREATE UNIQUE INDEX IF NOT EXISTS learning_suggestion_client_pending
  ON knowledge.learning_suggestion (client_id) WHERE status = 'pending';

-- Dedupe redelivered source events.
CREATE UNIQUE INDEX IF NOT EXISTS learning_suggestion_source_event
  ON knowledge.learning_suggestion (client_id, source_event_id) WHERE source_event_id IS NOT NULL;

ALTER TABLE knowledge.learning_suggestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.learning_suggestion FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON knowledge.learning_suggestion;
CREATE POLICY tenant_isolation ON knowledge.learning_suggestion
  USING (client_id = app.current_client_id())
  WITH CHECK (client_id = app.current_client_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.learning_suggestion TO rtnads_app;
