import type {
  CrmLeadRow,
  FunnelEventRow,
  SaleRow,
  LeadQualityBand,
} from "@rtnads/contracts";
import type {
  RawCrmLead,
  RawCrmFunnelEvent,
  RawCrmSale,
  CrmConnectorConfig,
} from "./types.js";
import { pseudonymize } from "./pseudonymize.js";

/**
 * Pure mapping from raw CRM payloads to pseudonymized warehouse rows. PII fields
 * (name/email/phone) are read only to derive the pseudonym + quality band and
 * are then DROPPED — they never appear in the output (docs/09 §3).
 */

const DEFAULT_BANDS = { high: 70, mid: 40 };

export function qualityBand(
  score: number | undefined,
  bands: { high: number; mid: number } = DEFAULT_BANDS,
): LeadQualityBand | null {
  if (score == null) return null;
  if (score >= bands.high) return "high";
  if (score >= bands.mid) return "mid";
  return "low";
}

export function mapLead(raw: RawCrmLead, config: CrmConnectorConfig): CrmLeadRow {
  return {
    pseudonym_id: pseudonymize(raw.identity, config.pseudonymSalt),
    attributed_entity_type: raw.attributed_entity_type ?? null,
    attributed_external_id: raw.attributed_external_id ?? null,
    source_platform: raw.source_platform,
    created_at: raw.created_at,
    lead_quality: qualityBand(raw.quality_score, config.qualityBands),
    // Only explicitly non-PII qualifiers are carried through.
    attributes: raw.attributes ?? {},
  };
}

export function mapFunnelEvent(
  raw: RawCrmFunnelEvent,
  config: CrmConnectorConfig,
): FunnelEventRow {
  return {
    pseudonym_id: pseudonymize(raw.identity, config.pseudonymSalt),
    stage_key: raw.stage_key,
    occurred_at: raw.occurred_at,
    value_minor: raw.value_minor ?? null,
  };
}

export function mapSale(raw: RawCrmSale, config: CrmConnectorConfig): SaleRow {
  return {
    pseudonym_id: pseudonymize(raw.identity, config.pseudonymSalt),
    occurred_at: raw.occurred_at,
    revenue_minor: raw.revenue_minor,
    margin_minor: raw.margin_minor ?? null,
    customer_value_minor: raw.customer_value_minor ?? null,
    sales_quality: raw.sales_quality ?? null,
    currency: raw.currency,
  };
}
