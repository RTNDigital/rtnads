-- 0011 — persisted recommendations (docs/03 §intel). The deterministic engines +
-- AI narrative produce a Recommendation; it is stored here for the operator UI to
-- review and act on. The full contract object is kept in `doc` (jsonb); a few
-- columns are promoted for listing/filtering. Tenant-isolated (RLS, fail-closed).

CREATE SCHEMA IF NOT EXISTS intel;

CREATE TABLE IF NOT EXISTS intel.recommendation (
  id                  uuid PRIMARY KEY,
  client_id           uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  entity_type         text NOT NULL,
  entity_id           uuid NOT NULL,
  account_id          uuid,
  recommendation_type text NOT NULL,
  status              text NOT NULL DEFAULT 'published',
  confidence          numeric NOT NULL DEFAULT 0,
  risk_level          text NOT NULL DEFAULT 'medium',
  doc                 jsonb NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recommendation_client_status_idx
  ON intel.recommendation (client_id, status, created_at DESC);

ALTER TABLE intel.recommendation ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.recommendation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON intel.recommendation;
CREATE POLICY tenant_isolation ON intel.recommendation
  USING (client_id = app.current_client_id())
  WITH CHECK (client_id = app.current_client_id());
GRANT USAGE ON SCHEMA intel TO rtnads_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON intel.recommendation TO rtnads_app;
