import type { NormalizedCrmSync, EntityType } from "@rtnads/contracts";

/**
 * L1 CRM connector abstractions. RAW inputs contain PII; the connector's job is
 * to pseudonymize at this boundary so nothing identifying flows to L2
 * (docs/07 §CRM Connectors, docs/09 §3).
 */

export interface CrmPullInput {
  client_id: string;
  vertical_path: string; // e.g. "health-tourism"
  window: { start: string; end: string };
}

export interface CrmConnector {
  readonly source: string;
  pull(input: CrmPullInput): Promise<NormalizedCrmSync>;
}

// ── RAW CRM shapes (contain PII — never leave L1 in this form) ───────────────

export interface RawCrmLead {
  /** Stable source identity used to derive the pseudonym (email/phone/crm id). */
  identity: string;
  // PII fields — used only to derive pseudonym/quality, then dropped:
  full_name?: string;
  email?: string;
  phone?: string;
  created_at: string;
  attributed_entity_type?: EntityType;
  /** External advertising id (e.g. Meta campaign id) for attribution. */
  attributed_external_id?: string;
  source_platform: string;
  /** Raw 0..100 quality score from the CRM, if any. */
  quality_score?: number;
  /** Non-PII qualifiers (procedure interest, market, …). */
  attributes?: Record<string, unknown>;
}

export interface RawCrmFunnelEvent {
  identity: string;
  stage_key: string;
  occurred_at: string;
  value_minor?: number;
}

export interface RawCrmSale {
  identity: string;
  occurred_at: string;
  revenue_minor: number;
  margin_minor?: number;
  customer_value_minor?: number;
  sales_quality?: "standard" | "premium";
  currency: string;
}

/** Port abstracting the CRM API (live) or fixtures (test). */
export interface CrmRawSource {
  fetchLeads(input: CrmPullInput): Promise<RawCrmLead[]>;
  fetchFunnelEvents(input: CrmPullInput): Promise<RawCrmFunnelEvent[]>;
  fetchSales(input: CrmPullInput): Promise<RawCrmSale[]>;
}

export interface CrmConnectorConfig {
  /** Secret salt for pseudonymization (from the vault in production). */
  pseudonymSalt: string;
  /** Score → band thresholds (inclusive lower bounds). */
  qualityBands?: { high: number; mid: number };
}
