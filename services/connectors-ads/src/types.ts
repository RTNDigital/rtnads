import type { NormalizedSync } from "@rtnads/contracts";

/**
 * L1 connector abstractions (docs/07-service-responsibilities.md — Connectors).
 *
 * A connector holds platform credentials and normalizes reads. To keep the
 * deterministic mapping testable WITHOUT a live API, fetching is behind a
 * `RawSource` port: production uses an HTTP-backed source, tests use recorded
 * fixtures. The mapping code is identical in both.
 */

export interface PullInput {
  client_id: string;
  account_external_id: string;
  /** Inclusive date window for insights (YYYY-MM-DD). */
  window: { start: string; end: string };
}

/** A platform connector produces a fully normalized sync for one account. */
export interface PlatformConnector {
  readonly platform: string;
  pull(input: PullInput): Promise<NormalizedSync>;
}

// ── Meta (Graph API) raw shapes — minimal subset we consume ──────────────────

export interface MetaAccount {
  id: string;
  name: string;
  currency: string; // ISO 4217
  timezone_name?: string;
  account_status?: number; // 1 = active
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective?: string;
  effective_status?: string; // ACTIVE | PAUSED | ...
}

export interface MetaAdSet {
  id: string;
  campaign_id: string;
  name: string;
  effective_status?: string;
  /** Budgets are returned by Meta in minor units, as strings. */
  daily_budget?: string;
  lifetime_budget?: string;
}

export interface MetaAd {
  id: string;
  adset_id: string;
  name: string;
  effective_status?: string;
  creative?: { id: string };
}

export interface MetaInsightAction {
  action_type: string;
  value: string;
}

export interface MetaInsight {
  level: "account" | "campaign" | "adset" | "ad";
  account_id?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  date_start: string; // YYYY-MM-DD
  date_stop: string;
  /** Spend is returned by Meta in MAJOR units, as a decimal string ("12.34"). */
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaInsightAction[];
  action_values?: MetaInsightAction[];
}

/** Port abstracting the Meta API (live) or fixtures (test). */
export interface MetaRawSource {
  fetchAccount(accountExternalId: string): Promise<MetaAccount>;
  fetchCampaigns(accountExternalId: string): Promise<MetaCampaign[]>;
  fetchAdSets(accountExternalId: string): Promise<MetaAdSet[]>;
  fetchAds(accountExternalId: string): Promise<MetaAd[]>;
  fetchInsights(
    accountExternalId: string,
    window: { start: string; end: string },
  ): Promise<MetaInsight[]>;
}

/** Which Meta action_types count as a conversion for this account. */
export interface MetaConnectorConfig {
  conversionActionTypes: string[];
  /** Decimal places for the account currency (default 2). */
  currencyMinorUnits?: number;
}

export const DEFAULT_META_CONFIG: MetaConnectorConfig = {
  conversionActionTypes: [
    "lead",
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.lead_grouped",
  ],
  currencyMinorUnits: 2,
};
