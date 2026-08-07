-- 0006 — Row-Level Security (tenancy, fails closed)
-- Every tenant-scoped table is isolated by client_id. The app sets the tenant per
-- transaction via  SET LOCAL app.client_id = '<uuid>';  derived from the session
-- principal — never from a request body (docs/09 §4, docs/06 §5).
--
-- current_setting('app.client_id', true) returns NULL when unset, so an
-- unscoped connection sees NO rows (fail-closed), never all rows.

CREATE SCHEMA IF NOT EXISTS app;

-- A dedicated application role that RLS is enforced for. Superusers/owners bypass
-- RLS, so migrations run as the owner; the app connects as rtnads_app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rtnads_app') THEN
    CREATE ROLE rtnads_app NOLOGIN;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.current_client_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.client_id', true), '')::uuid
$$;

-- Enable + FORCE RLS and attach a client_id policy to every tenant-scoped table.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'core.ad_account', 'core.campaign', 'core.ad_set', 'core.creative', 'core.ad',
    'facts.entity_daily',
    'taxonomy.classification',
    'crm.lead', 'crm.funnel_event', 'crm.sale'
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

-- Read access to global (non-tenant) reference data for the app role.
GRANT USAGE ON SCHEMA core, taxonomy, crm, facts, app TO rtnads_app;
GRANT SELECT ON core.platform, taxonomy.node, taxonomy.dimension,
                taxonomy.dimension_value, crm.funnel_stage TO rtnads_app;
GRANT EXECUTE ON FUNCTION app.current_client_id() TO rtnads_app;
