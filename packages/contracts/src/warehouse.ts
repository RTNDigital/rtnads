import { z } from "zod";
import { Uuid, EntityType } from "./common.js";

/**
 * Canonical warehouse row contracts — the normalized shapes that connectors map
 * platform payloads INTO (docs/03-database-model.md §core, §facts;
 * docs/07-service-responsibilities.md — Normalizer owns the core and facts tables).
 *
 * These are the output of the deterministic mapping step. External platform ids
 * are carried as `external_id`; internal uuid keys are assigned at load time.
 */

export const AccountMaturity = z.enum(["new", "ramping", "mature"]);
export type AccountMaturity = z.infer<typeof AccountMaturity>;

export const CampaignMaturity = z.enum(["learning", "stabilizing", "mature"]);
export type CampaignMaturity = z.infer<typeof CampaignMaturity>;

export const AdAccountRow = z.object({
  platform: z.string(), // 'meta' | 'google' | ...
  external_id: z.string(),
  name: z.string(),
  currency: z.string().length(3),
  timezone: z.string().default("UTC"),
  maturity: AccountMaturity.default("new"),
  status: z.string().default("active"),
});
export type AdAccountRow = z.infer<typeof AdAccountRow>;

export const CampaignRow = z.object({
  account_external_id: z.string(),
  external_id: z.string(),
  name: z.string(),
  objective: z.string().nullable().default(null),
  status: z.string().default("active"),
  maturity: CampaignMaturity.default("learning"),
});
export type CampaignRow = z.infer<typeof CampaignRow>;

export const AdSetRow = z.object({
  campaign_external_id: z.string(),
  external_id: z.string(),
  name: z.string(),
  status: z.string().default("active"),
  budget_minor: z.number().int().nullable().default(null),
  budget_type: z.string().nullable().default(null), // 'daily' | 'lifetime'
});
export type AdSetRow = z.infer<typeof AdSetRow>;

export const AdRow = z.object({
  ad_set_external_id: z.string(),
  external_id: z.string(),
  name: z.string(),
  status: z.string().default("active"),
  creative_external_id: z.string().nullable().default(null),
});
export type AdRow = z.infer<typeof AdRow>;

export const CreativeRow = z.object({
  external_id: z.string(),
  format: z.string().nullable().default(null),
  asset_ref: z.string().nullable().default(null),
});
export type CreativeRow = z.infer<typeof CreativeRow>;

/** A normalized daily fact for one entity (maps facts.entity_daily). */
export const EntityDailyFact = z.object({
  entity_type: EntityType,
  entity_external_id: z.string(),
  date: z.string().date(),
  currency: z.string().length(3),
  spend_minor: z.number().int().nonnegative().default(0),
  impressions: z.number().int().nonnegative().default(0),
  clicks: z.number().int().nonnegative().default(0),
  conversions: z.number().nonnegative().default(0),
  conversion_value_minor: z.number().int().nonnegative().default(0),
  platform_metrics: z.record(z.string(), z.unknown()).default({}),
  data_quality: z.record(z.string(), z.unknown()).default({}),
});
export type EntityDailyFact = z.infer<typeof EntityDailyFact>;

/**
 * The full normalized result of a connector sync for one account — the boundary
 * between L1 (connectors) and L2 (warehouse loader).
 */
export const NormalizedSync = z.object({
  client_id: Uuid,
  account: AdAccountRow,
  campaigns: z.array(CampaignRow),
  ad_sets: z.array(AdSetRow),
  ads: z.array(AdRow),
  creatives: z.array(CreativeRow),
  facts: z.array(EntityDailyFact),
});
export type NormalizedSync = z.infer<typeof NormalizedSync>;
