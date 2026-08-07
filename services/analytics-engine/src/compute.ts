import type {
  MetricTotals,
  DerivedMetrics,
  FunnelResult,
  FunnelStageResult,
  UnitEconomics,
  UnitEconomicsModel,
  UnitEconomicsAssumptions,
} from "@rtnads/contracts";
import { money, divideMoney, ratio } from "@rtnads/domain";
import type {
  FactAggregate,
  StageDef,
  FunnelCounts,
  SalesAggregate,
} from "./types.js";

/**
 * Pure, deterministic analytics. No I/O, no clock, no randomness — the same
 * inputs always yield the same numbers (docs/07 §L3, docs/14 §2). The LLM never
 * computes any of this; it only reads the results via MCP.
 */

/** Which funnel stage keys play each economic role, per business model. */
const MODEL_STAGE_ROLES: Record<
  UnitEconomicsModel,
  { lead: string; qualified: string; booking: string; sale: string }
> = {
  health_tourism: {
    lead: "lead",
    qualified: "qualified",
    booking: "booking",
    sale: "sale",
  },
  services: {
    lead: "lead",
    qualified: "qualified",
    booking: "booking",
    sale: "sale",
  },
  ecommerce: {
    lead: "lead",
    qualified: "qualified",
    booking: "checkout",
    sale: "purchase",
  },
};

export function computeTotals(facts: FactAggregate): MetricTotals {
  return {
    currency: facts.currency,
    spend: money(facts.spend_minor, facts.currency),
    impressions: facts.impressions,
    clicks: facts.clicks,
    conversions: facts.conversions,
    conversion_value: money(facts.conversion_value_minor, facts.currency),
  };
}

export function computeDerived(facts: FactAggregate): DerivedMetrics {
  return {
    ctr: ratio(facts.clicks, facts.impressions),
    cpc: divideMoney(facts.spend_minor, facts.clicks, facts.currency),
    cpl: divideMoney(facts.spend_minor, facts.conversions, facts.currency),
    cpa: divideMoney(facts.spend_minor, facts.conversions, facts.currency),
    roas: ratio(facts.conversion_value_minor, facts.spend_minor),
  };
}

/**
 * Compute funnel counts and stage-to-stage conversion rates. Stages are provided
 * as data (per vertical), so this works for any funnel definition.
 */
export function computeFunnel(
  stages: StageDef[],
  counts: FunnelCounts,
): FunnelResult {
  const ordered = [...stages].sort((a, b) => a.ordinal - b.ordinal);
  const results: FunnelStageResult[] = [];
  let prevCount: number | null = null;
  for (const s of ordered) {
    const count = counts[s.key] ?? 0;
    const rate_from_prev =
      prevCount === null ? null : prevCount > 0 ? count / prevCount : null;
    results.push({
      key: s.key,
      label: s.label,
      ordinal: s.ordinal,
      count,
      rate_from_prev,
    });
    prevCount = count;
  }
  const first = results[0]?.count ?? 0;
  const last = results[results.length - 1]?.count ?? 0;
  const overall_rate = first > 0 ? last / first : null;
  return { stages: results, overall_rate };
}

/**
 * Business-specific unit economics. Health Tourism does NOT reduce to CPL —
 * cost per qualified lead, cost per booking, CAC and revenue per lead are all
 * first-class (docs/02 §6, docs/11).
 */
export function computeUnitEconomics(
  facts: FactAggregate,
  counts: FunnelCounts,
  sales: SalesAggregate,
  model: UnitEconomicsModel,
  assumptions: UnitEconomicsAssumptions,
): UnitEconomics {
  const roles = MODEL_STAGE_ROLES[model];
  const currency = facts.currency;
  const spend = facts.spend_minor;

  // Prefer CRM lead counts; fall back to platform conversions when CRM is absent.
  const leads = counts[roles.lead] ?? facts.conversions;
  const qualified = counts[roles.qualified] ?? 0;
  const bookings = counts[roles.booking] ?? 0;
  const salesCount = sales.count > 0 ? sales.count : (counts[roles.sale] ?? 0);
  const revenue = sales.revenue_minor;

  const marginBase =
    sales.margin_minor != null
      ? sales.margin_minor
      : Math.round(revenue * assumptions.margin_rate);

  return {
    model,
    currency,
    cpl: divideMoney(spend, leads, currency),
    cost_per_qualified_lead: divideMoney(spend, qualified, currency),
    cost_per_booking: divideMoney(spend, bookings, currency),
    cac: divideMoney(spend, salesCount, currency),
    revenue_per_lead: divideMoney(revenue, leads, currency),
    roas: ratio(revenue, spend),
    contribution_margin: money(marginBase - spend, currency),
    assumptions,
  };
}
