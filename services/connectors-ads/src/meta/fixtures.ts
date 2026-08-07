import type {
  MetaAccount,
  MetaCampaign,
  MetaAdSet,
  MetaAd,
  MetaInsight,
  MetaRawSource,
} from "../types.js";

/**
 * Recorded Meta Graph API payloads for a Health Tourism / Rhinoplasty account.
 * These stand in for live API responses so the read-path is testable in CI with
 * no network (docs/14-testing-strategy.md §6 — recorded-fixture connector tests).
 */

export const ACCOUNT: MetaAccount = {
  id: "act_1001",
  name: "RhinoUK Clinic — Meta",
  currency: "GBP",
  timezone_name: "Europe/London",
  account_status: 1,
};

export const CAMPAIGNS: MetaCampaign[] = [
  {
    id: "camp_2001",
    name: "Rhino-UK-Leads-Q3",
    objective: "OUTCOME_LEADS",
    effective_status: "ACTIVE",
  },
];

export const AD_SETS: MetaAdSet[] = [
  {
    id: "adset_3001",
    campaign_id: "camp_2001",
    name: "UK-25-45-Interest-A",
    effective_status: "ACTIVE",
    daily_budget: "5000", // £50.00 in minor units
  },
  {
    id: "adset_3002",
    campaign_id: "camp_2001",
    name: "UK-25-45-DoctorVideo-B",
    effective_status: "ACTIVE",
    lifetime_budget: "120000", // £1,200.00
  },
];

export const ADS: MetaAd[] = [
  {
    id: "ad_4001",
    adset_id: "adset_3001",
    name: "Static-BeforeAfter",
    effective_status: "ACTIVE",
    creative: { id: "cre_5001" },
  },
  {
    id: "ad_4002",
    adset_id: "adset_3002",
    name: "Doctor-Testimonial-Video",
    effective_status: "ACTIVE",
    creative: { id: "cre_5002" },
  },
];

export const INSIGHTS: MetaInsight[] = [
  {
    level: "ad",
    ad_id: "ad_4001",
    date_start: "2026-07-01",
    date_stop: "2026-07-01",
    spend: "42.10",
    impressions: "3120",
    clicks: "88",
    actions: [{ action_type: "lead", value: "3" }],
    action_values: [{ action_type: "lead", value: "0" }],
  },
  {
    level: "ad",
    ad_id: "ad_4002",
    date_start: "2026-07-01",
    date_stop: "2026-07-01",
    spend: "63.00",
    impressions: "4500",
    clicks: "120",
    actions: [
      { action_type: "lead", value: "6" },
      { action_type: "link_click", value: "120" }, // not a conversion → ignored
    ],
    action_values: [{ action_type: "lead", value: "0" }],
  },
  {
    level: "campaign",
    campaign_id: "camp_2001",
    date_start: "2026-07-01",
    date_stop: "2026-07-01",
    spend: "105.10",
    impressions: "7620",
    clicks: "208",
    actions: [{ action_type: "lead", value: "9" }],
  },
];

/** A fixture-backed RawSource. Swap for an HTTP-backed source in production. */
export class FixtureMetaSource implements MetaRawSource {
  async fetchAccount(): Promise<MetaAccount> {
    return ACCOUNT;
  }
  async fetchCampaigns(): Promise<MetaCampaign[]> {
    return CAMPAIGNS;
  }
  async fetchAdSets(): Promise<MetaAdSet[]> {
    return AD_SETS;
  }
  async fetchAds(): Promise<MetaAd[]> {
    return ADS;
  }
  async fetchInsights(): Promise<MetaInsight[]> {
    return INSIGHTS;
  }
}
