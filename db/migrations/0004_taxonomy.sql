-- 0004 — extensible taxonomy, dimension registry, classifications, creative meta
-- The extensibility guarantee lives here: new verticals/subcategories/dimensions
-- are ROWS, not migrations (docs/02 §3–4, docs/03 §taxonomy).

-- ── the industry tree ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taxonomy.node (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES taxonomy.node(id) ON DELETE CASCADE,
  key       text NOT NULL,
  label     text NOT NULL,
  level     int  NOT NULL DEFAULT 0,
  path      text NOT NULL UNIQUE,        -- 'health-tourism/rhinoplasty'
  metadata  jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS taxonomy_node_parent_idx ON taxonomy.node (parent_id);

-- ── context dimension registry ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taxonomy.dimension (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE,       -- 'platform','budget_range','creative_angle'
  label      text NOT NULL,
  value_type text NOT NULL,              -- enum|taxonomy_ref|range|embedding|free
  config     jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS taxonomy.dimension_value (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_id uuid NOT NULL REFERENCES taxonomy.dimension(id) ON DELETE CASCADE,
  value        text NOT NULL,
  ordinal      int,                       -- for ranges / bands
  metadata     jsonb NOT NULL DEFAULT '{}',
  UNIQUE (dimension_id, value)
);

-- ── classifications: (entity, dimension) -> value, versioned & sourced ───────
CREATE TABLE IF NOT EXISTS taxonomy.classification (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES iam.client(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  dimension_id uuid NOT NULL REFERENCES taxonomy.dimension(id),
  value        text NOT NULL,
  source       text NOT NULL,             -- ingested|rule|ai-suggested|human
  confidence   numeric NOT NULL DEFAULT 1.0,
  valid_from   timestamptz NOT NULL DEFAULT now(),
  valid_to     timestamptz,               -- null = current
  UNIQUE (entity_type, entity_id, dimension_id, valid_from)
);
CREATE INDEX IF NOT EXISTS classification_client_idx ON taxonomy.classification (client_id);
-- "current context" lookups only need live rows.
CREATE INDEX IF NOT EXISTS classification_current_idx
  ON taxonomy.classification (entity_type, entity_id)
  WHERE valid_to IS NULL;

-- ── structured creative metadata (versioned) ────────────────────────────────
CREATE TABLE IF NOT EXISTS taxonomy.creative_attribute (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid NOT NULL REFERENCES core.creative(id) ON DELETE CASCADE,
  attribute   text NOT NULL,              -- 'hook','doctor_presence','message_angle'
  value       text NOT NULL,
  source      text NOT NULL,              -- ai-suggested|human|ingested
  confidence  numeric NOT NULL DEFAULT 1.0,
  valid_from  timestamptz NOT NULL DEFAULT now(),
  valid_to    timestamptz
);
CREATE INDEX IF NOT EXISTS creative_attribute_creative_idx
  ON taxonomy.creative_attribute (creative_id) WHERE valid_to IS NULL;
