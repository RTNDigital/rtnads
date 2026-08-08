import type { EntityRef } from "@rtnads/contracts";

/**
 * CRM MCP repository port + types (docs/04 §2.3, docs/05 §C). Everything here is
 * ANONYMIZED by construction: results carry only bands, rates and aggregates —
 * never a pseudonym id, name, email or phone. PII cannot be expressed by these
 * shapes (docs/09 §3).
 */

export interface DateWindow { start: string; end: string; }

export interface LeadQualityDistribution {
  bands: { band: string; count: number; share: number }[];
  qualification_rate: number;
  sample_size: number;
}

export interface FunnelConversion {
  stages: { from: string; to: string; rate: number; n: number }[];
  overall_lead_to_sale: number | null;
}

export interface SalesOutcomes {
  sales: number;
  revenue_minor: number;
  currency: string;
  avg_order_value_minor: number | null;
  sales_quality: { band: string; count: number }[];
}

export interface CrmRepository {
  leadQualityDistribution(clientId: string, entity: EntityRef, window: DateWindow): Promise<LeadQualityDistribution>;
  funnelConversion(clientId: string, entity: EntityRef, window: DateWindow): Promise<FunnelConversion>;
  salesOutcomes(clientId: string, entity: EntityRef, window: DateWindow): Promise<SalesOutcomes>;
}
