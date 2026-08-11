-- 0003 — time-series performance facts (docs/03-database-model.md §facts)
-- Narrow, additive fact table. Partitioned by month; all benchmark math reads here.

CREATE TABLE IF NOT EXISTS facts.entity_daily (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id              uuid NOT NULL,
  entity_type            text NOT NULL,   -- account|campaign|ad_set|ad|creative
  entity_id              uuid NOT NULL,
  date                   date NOT NULL,
  currency               text NOT NULL,
  spend_minor            bigint NOT NULL DEFAULT 0,
  impressions            bigint NOT NULL DEFAULT 0,
  clicks                 bigint NOT NULL DEFAULT 0,
  conversions            numeric NOT NULL DEFAULT 0,
  conversion_value_minor bigint NOT NULL DEFAULT 0,
  platform_metrics       jsonb NOT NULL DEFAULT '{}',
  data_quality           jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (client_id, entity_type, entity_id, date)
) PARTITION BY RANGE (date);

-- A default partition keeps M0 simple; a maintenance job creates monthly
-- partitions ahead of time in later milestones.
CREATE TABLE IF NOT EXISTS facts.entity_daily_default
  PARTITION OF facts.entity_daily DEFAULT;

CREATE INDEX IF NOT EXISTS entity_daily_client_date_idx
  ON facts.entity_daily (client_id, date);
CREATE INDEX IF NOT EXISTS entity_daily_entity_idx
  ON facts.entity_daily (client_id, entity_type, entity_id, date);
