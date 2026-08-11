-- 0008 — idempotent "current classification" upsert key.
-- A partial unique index over live rows lets the Classifier upsert the current
-- (entity, dimension) classification without duplicating it on replay
-- (docs/02 §4 — classifications are versioned & sourced).

CREATE UNIQUE INDEX IF NOT EXISTS classification_current_unique
  ON taxonomy.classification (entity_type, entity_id, dimension_id)
  WHERE valid_to IS NULL;
