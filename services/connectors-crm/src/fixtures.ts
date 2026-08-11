import type {
  RawCrmLead,
  RawCrmFunnelEvent,
  RawCrmSale,
  CrmRawSource,
} from "./types.js";

/**
 * Recorded CRM payloads for the same RhinoUK account as the ads fixtures. Ten
 * leads attributed to campaign `camp_2001` progress through the Health Tourism
 * funnel, with one sale — so the Analytics Engine's qualified-lead economics
 * light up end-to-end (docs/11 example).
 *
 * NOTE: these RAW records deliberately contain PII (name/email/phone) to prove
 * the connector strips it — the normalized output must contain none of it.
 */

const OCCUR = "2026-07-01T09:00:00.000Z";

function lead(n: number, score: number): RawCrmLead {
  const id = String(n).padStart(2, "0");
  return {
    identity: `rhinouk-lead-${id}`,
    full_name: `Patient ${id}`, // PII — must be dropped
    email: `patient${id}@example.com`, // PII — must be dropped
    phone: `+44 7700 9000${id}`, // PII — must be dropped
    created_at: OCCUR,
    attributed_entity_type: "campaign",
    attributed_external_id: "camp_2001",
    source_platform: "hubspot",
    quality_score: score,
    attributes: { procedure_interest: "rhinoplasty", market: "uk" },
  };
}

// 10 leads with varying quality scores.
export const LEADS: RawCrmLead[] = [
  lead(1, 92), lead(2, 81), lead(3, 74), lead(4, 71),
  lead(5, 55), lead(6, 48), lead(7, 41), lead(8, 38),
  lead(9, 30), lead(10, 12),
];

function ev(n: number, stage_key: string): RawCrmFunnelEvent {
  return { identity: `rhinouk-lead-${String(n).padStart(2, "0")}`, stage_key, occurred_at: OCCUR };
}

// Funnel progression → counts: lead 10, contacted 8, qualified 4,
// commercial_opportunity 2, booking 2, sale 1.
export const EVENTS: RawCrmFunnelEvent[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ev(n, "lead")),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ev(n, "contacted")),
  ...[1, 2, 3, 4].map((n) => ev(n, "qualified")),
  ...[1, 2].map((n) => ev(n, "commercial_opportunity")),
  ...[1, 2].map((n) => ev(n, "booking")),
  ...[1].map((n) => ev(n, "sale")),
];

export const SALES: RawCrmSale[] = [
  {
    identity: "rhinouk-lead-01",
    occurred_at: OCCUR,
    revenue_minor: 500000, // £5,000.00
    customer_value_minor: 500000,
    sales_quality: "premium",
    currency: "GBP",
  },
];

export class FixtureCrmSource implements CrmRawSource {
  async fetchLeads(): Promise<RawCrmLead[]> {
    return LEADS;
  }
  async fetchFunnelEvents(): Promise<RawCrmFunnelEvent[]> {
    return EVENTS;
  }
  async fetchSales(): Promise<RawCrmSale[]> {
    return SALES;
  }
}
