import type {
  EntityRef,
  MetricTotals,
  DerivedMetrics,
  FunnelResult,
  UnitEconomics,
  UnitEconomicsModel,
  UnitEconomicsAssumptions,
} from "@rtnads/contracts";
import type { AnalyticsRepository, DateWindow } from "./types.js";
import {
  computeTotals,
  computeDerived,
  computeFunnel,
  computeUnitEconomics,
} from "./compute.js";

export const DEFAULT_ASSUMPTIONS: UnitEconomicsAssumptions = {
  attribution_window_days: 30,
  margin_rate: 0.4,
};

/** The full deterministic analytics snapshot for one entity/window. */
export interface EntityAnalytics {
  entity: EntityRef;
  window: DateWindow;
  totals: MetricTotals;
  derived: DerivedMetrics;
  funnel: FunnelResult;
  unit_economics: UnitEconomics;
}

/**
 * Orchestrates load → compute. Pure computation, thin data access. This is the
 * L3 service the Ads Analytics MCP will adapt into read-only tools (docs/04, 05).
 */
export class AnalyticsEngine {
  constructor(
    private readonly repo: AnalyticsRepository,
    private readonly assumptions: UnitEconomicsAssumptions = DEFAULT_ASSUMPTIONS,
  ) {}

  async analyze(
    clientId: string,
    entity: EntityRef,
    window: DateWindow,
    model: UnitEconomicsModel,
  ): Promise<EntityAnalytics> {
    const inp = await this.repo.load(clientId, entity, window, model);
    return {
      entity,
      window,
      totals: computeTotals(inp.facts),
      derived: computeDerived(inp.facts),
      funnel: computeFunnel(inp.stages, inp.funnel),
      unit_economics: computeUnitEconomics(
        inp.facts,
        inp.funnel,
        inp.sales,
        model,
        this.assumptions,
      ),
    };
  }
}
