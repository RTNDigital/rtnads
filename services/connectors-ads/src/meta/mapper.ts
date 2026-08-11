import type {
  AdAccountRow,
  CampaignRow,
  AdSetRow,
  AdRow,
  CreativeRow,
  EntityDailyFact,
} from "@rtnads/contracts";
import type {
  MetaAccount,
  MetaCampaign,
  MetaAdSet,
  MetaAd,
  MetaInsight,
  MetaConnectorConfig,
} from "../types.js";

/**
 * Pure, deterministic mapping from Meta raw payloads to canonical warehouse rows.
 * No I/O, no clock, no randomness — same input, same output (docs/07 §Normalizer,
 * docs/14 §2). Platform quirks (money units, status vocab) stop here.
 */

/** Convert a MAJOR-unit decimal string ("12.34") to integer minor units. */
export function majorDecimalToMinor(
  value: string | undefined,
  minorUnits = 2,
): number {
  if (value == null || value.trim() === "") return 0;
  const neg = value.trim().startsWith("-");
  const [intPart = "0", fracPartRaw = ""] = value.trim().replace(/^-/, "").split(".");
  const frac = (fracPartRaw + "0".repeat(minorUnits)).slice(0, minorUnits);
  const minor = Number(intPart) * 10 ** minorUnits + Number(frac || "0");
  return neg ? -minor : minor;
}

/** Parse an integer-ish string ("1234") safely to a non-negative integer. */
export function toInt(value: string | undefined): number {
  if (value == null || value.trim() === "") return 0;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : 0;
}

/** Parse a minor-unit budget string as returned by Meta ("5000" = 50.00). */
export function budgetMinor(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : null;
}

/** Normalize Meta's effective_status vocabulary to our canonical lifecycle. */
export function mapStatus(effective?: string): string {
  switch ((effective ?? "").toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "PAUSED":
    case "ADSET_PAUSED":
    case "CAMPAIGN_PAUSED":
      return "paused";
    case "ARCHIVED":
      return "archived";
    case "DELETED":
      return "deleted";
    default:
      return "unknown";
  }
}

export function mapAccount(raw: MetaAccount): AdAccountRow {
  return {
    platform: "meta",
    external_id: raw.id,
    name: raw.name,
    currency: raw.currency,
    timezone: raw.timezone_name ?? "UTC",
    maturity: "new",
    status: raw.account_status === 1 ? "active" : "inactive",
  };
}

export function mapCampaign(raw: MetaCampaign): CampaignRow {
  return {
    account_external_id: "", // filled by the connector (account context)
    external_id: raw.id,
    name: raw.name,
    objective: raw.objective ?? null,
    status: mapStatus(raw.effective_status),
    maturity: "learning",
  };
}

export function mapAdSet(raw: MetaAdSet): AdSetRow {
  const daily = budgetMinor(raw.daily_budget);
  const lifetime = budgetMinor(raw.lifetime_budget);
  return {
    campaign_external_id: raw.campaign_id,
    external_id: raw.id,
    name: raw.name,
    status: mapStatus(raw.effective_status),
    budget_minor: daily ?? lifetime,
    budget_type: daily != null ? "daily" : lifetime != null ? "lifetime" : null,
  };
}

export function mapAd(raw: MetaAd): AdRow {
  return {
    ad_set_external_id: raw.adset_id,
    external_id: raw.id,
    name: raw.name,
    status: mapStatus(raw.effective_status),
    creative_external_id: raw.creative?.id ?? null,
  };
}

export function mapCreativeFromAd(raw: MetaAd): CreativeRow | null {
  if (!raw.creative?.id) return null;
  return { external_id: raw.creative.id, format: null, asset_ref: null };
}

const META_LEVEL_TO_ENTITY: Record<
  MetaInsight["level"],
  EntityDailyFact["entity_type"]
> = {
  account: "account",
  campaign: "campaign",
  adset: "ad_set",
  ad: "ad",
};

function insightEntityExternalId(raw: MetaInsight): string | null {
  switch (raw.level) {
    case "account":
      return raw.account_id ?? null;
    case "campaign":
      return raw.campaign_id ?? null;
    case "adset":
      return raw.adset_id ?? null;
    case "ad":
      return raw.ad_id ?? null;
  }
}

/** Sum the configured conversion action types from a Meta actions array. */
export function sumConversions(
  actions: { action_type: string; value: string }[] | undefined,
  conversionActionTypes: string[],
): number {
  if (!actions) return 0;
  const wanted = new Set(conversionActionTypes);
  let total = 0;
  for (const a of actions) {
    if (wanted.has(a.action_type)) total += Number(a.value) || 0;
  }
  return total;
}

/**
 * Map a Meta insight row to a normalized daily fact. Returns null if the row has
 * no resolvable entity id (defensive; such rows are skipped, not fabricated).
 */
export function mapInsight(
  raw: MetaInsight,
  currency: string,
  config: MetaConnectorConfig,
): EntityDailyFact | null {
  const extId = insightEntityExternalId(raw);
  if (!extId) return null;
  const minorUnits = config.currencyMinorUnits ?? 2;
  const conversions = sumConversions(raw.actions, config.conversionActionTypes);
  const conversionValueMajor = raw.action_values
    ? String(
        raw.action_values
          .filter((v) => config.conversionActionTypes.includes(v.action_type))
          .reduce((s, v) => s + (Number(v.value) || 0), 0),
      )
    : "0";
  return {
    entity_type: META_LEVEL_TO_ENTITY[raw.level],
    entity_external_id: extId,
    date: raw.date_start,
    currency,
    spend_minor: majorDecimalToMinor(raw.spend, minorUnits),
    impressions: toInt(raw.impressions),
    clicks: toInt(raw.clicks),
    conversions,
    conversion_value_minor: majorDecimalToMinor(conversionValueMajor, minorUnits),
    platform_metrics: {},
    data_quality: { source: "meta", complete: true },
  };
}
