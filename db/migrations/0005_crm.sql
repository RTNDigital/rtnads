-- 0005 — pseudonymized CRM outcomes (first-class source)
-- PII NEVER lands here — only pseudonymous ids + computed, non-identifying
-- attributes (docs/09-security-model.md §3). Funnel stages are DATA, so each
-- vertical defines its own funnel without schema change.

CREATE TABLE IF NOT EXISTS crm.funnel_stage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_node_id uuid REFERENCES taxonomy.node(id) ON DELETE CASCADE,
  key             text NOT NULL,          -- 'lead','contacted','qualified',...
  label           text NOT NULL,
  ordinal         int  NOT NULL,
  UNIQUE (vertical_node_id, key)
);

CREATE TABLE IF NOT EXISTS crm.lead (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  pseudonym_id           text NOT NULL,   -- opaque, stable, non-reversible here
  ad_account_id          uuid REFERENCES core.ad_account(id) ON DELETE SET NULL,
  attributed_entity_type text,
  attributed_entity_id   uuid,
  source_platform        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  lead_quality           text,            -- computed band
  attributes             jsonb NOT NULL DEFAULT '{}',  -- non-PII qualifiers only
  UNIQUE (client_id, pseudonym_id)
);
CREATE INDEX IF NOT EXISTS lead_client_idx ON crm.lead (client_id);
CREATE INDEX IF NOT EXISTS lead_attribution_idx
  ON crm.lead (attributed_entity_type, attributed_entity_id);

CREATE TABLE IF NOT EXISTS crm.funnel_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES crm.lead(id) ON DELETE CASCADE,
  stage_id    uuid NOT NULL REFERENCES crm.funnel_stage(id),
  occurred_at timestamptz NOT NULL,
  value_minor bigint,
  metadata    jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS funnel_event_lead_idx ON crm.funnel_event (lead_id);
CREATE INDEX IF NOT EXISTS funnel_event_client_time_idx ON crm.funnel_event (client_id, occurred_at);

CREATE TABLE IF NOT EXISTS crm.sale (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  lead_id              uuid NOT NULL REFERENCES crm.lead(id) ON DELETE CASCADE,
  occurred_at          timestamptz NOT NULL,
  revenue_minor        bigint NOT NULL,
  margin_minor         bigint,
  customer_value_minor bigint,
  sales_quality        text,
  currency             text NOT NULL
);
CREATE INDEX IF NOT EXISTS sale_client_idx ON crm.sale (client_id);
CREATE INDEX IF NOT EXISTS sale_lead_idx ON crm.sale (lead_id);
