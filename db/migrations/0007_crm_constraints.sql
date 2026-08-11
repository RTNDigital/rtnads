-- 0007 — natural-key constraints so CRM ingestion is idempotent on replay.
-- A lead enters a given funnel stage once; a sale is keyed by lead + timestamp.
-- (docs/08 §9 — consumers are idempotent; docs/14 §6 — replay = identical state.)

CREATE UNIQUE INDEX IF NOT EXISTS funnel_event_unique
  ON crm.funnel_event (client_id, lead_id, stage_id);

CREATE UNIQUE INDEX IF NOT EXISTS sale_unique
  ON crm.sale (client_id, lead_id, occurred_at);
