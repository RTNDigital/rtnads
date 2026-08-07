import type { EntityRef, UnitEconomicsModel } from "@rtnads/contracts";

/**
 * Inputs and ports for the Analytics Engine. The engine computes over these
 * plain, typed inputs — it does not know about SQL. A repository port supplies
 * them (Postgres in production, in-memory for tests), keeping the math pure and
 * reproducible (docs/07 §L3, docs/14 §2).
 */

/** Aggregated advertising facts for one entity over a window (minor units). */
export interface FactAggregate {
  currency: string;
  spend_minor: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_value_minor: number;
}

/** A CRM funnel stage definition (data-driven, per vertical). */
export interface StageDef {
  key: string;
  label: string;
  ordinal: number;
}

/** Counts of leads that reached each funnel stage, keyed by stage key. */
export type FunnelCounts = Record<string, number>;

/** Aggregated sales outcomes for the window. */
export interface SalesAggregate {
  count: number;
  revenue_minor: number;
  margin_minor: number | null;
  currency: string;
}

export interface DateWindow {
  start: string;
  end: string;
}

/** Everything the engine needs to analyze one entity for one window. */
export interface AnalyticsInputs {
  entity: EntityRef;
  window: DateWindow;
  facts: FactAggregate;
  stages: StageDef[];
  funnel: FunnelCounts;
  sales: SalesAggregate;
  model: UnitEconomicsModel;
}

/** Port that supplies inputs from a data source (warehouse or fixtures). */
export interface AnalyticsRepository {
  load(
    clientId: string,
    entity: EntityRef,
    window: DateWindow,
    model: UnitEconomicsModel,
  ): Promise<AnalyticsInputs>;
}
