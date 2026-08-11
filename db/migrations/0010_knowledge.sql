-- 0010 — Strategy Memory (docs/03 §knowledge). RTN House playbooks, rules,
-- curated benchmarks and per-client optimization policies. Playbooks/rules/
-- benchmarks are global RTN knowledge; optimization_policy is client-scoped (RLS).

CREATE SCHEMA IF NOT EXISTS knowledge;

CREATE TABLE IF NOT EXISTS knowledge.playbook (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          jsonb NOT NULL DEFAULT '{}',  -- {vertical,subcategory,platform,market}
  title          text NOT NULL,
  body_md        text NOT NULL,
  version        int  NOT NULL DEFAULT 1,
  status         text NOT NULL DEFAULT 'active',
  effective_from date,
  source         text NOT NULL DEFAULT 'rtn-strategy'
);

CREATE TABLE IF NOT EXISTS knowledge.rule (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      jsonb NOT NULL DEFAULT '{}',
  key        text NOT NULL,
  definition jsonb NOT NULL,
  priority   int  NOT NULL DEFAULT 100,
  version    int  NOT NULL DEFAULT 1,
  enabled    boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS knowledge.benchmark_ref (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope   jsonb NOT NULL DEFAULT '{}',
  metric  text NOT NULL,
  value   numeric NOT NULL,
  unit    text NOT NULL,
  sample  jsonb NOT NULL DEFAULT '{}',
  source  text NOT NULL DEFAULT 'rtn-strategy',
  version int  NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS knowledge.optimization_policy (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  definition     jsonb NOT NULL,
  version        int  NOT NULL DEFAULT 1,
  enabled        boolean NOT NULL DEFAULT true,
  effective_from date
);
CREATE UNIQUE INDEX IF NOT EXISTS optimization_policy_client_current
  ON knowledge.optimization_policy (client_id) WHERE enabled;

-- Global knowledge is readable by the app role.
GRANT USAGE ON SCHEMA knowledge TO rtnads_app;
GRANT SELECT ON knowledge.playbook, knowledge.rule, knowledge.benchmark_ref TO rtnads_app;

-- Client-scoped policy is tenant-isolated (RLS, fail-closed).
ALTER TABLE knowledge.optimization_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.optimization_policy FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON knowledge.optimization_policy;
CREATE POLICY tenant_isolation ON knowledge.optimization_policy
  USING (client_id = app.current_client_id())
  WITH CHECK (client_id = app.current_client_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge.optimization_policy TO rtnads_app;
