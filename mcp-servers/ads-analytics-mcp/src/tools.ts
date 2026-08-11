import { z } from "zod";
import {
  Authz,
  EntityRef,
  DateWindow,
  Money,
  ResponseMeta,
  MetricTotals,
  DerivedMetrics,
  FunnelResult,
  UnitEconomics,
  UnitEconomicsModel,
} from "@rtnads/contracts";
import type { AnalyticsEngine } from "@rtnads/analytics-engine";
import type { BenchmarkEngine } from "@rtnads/benchmark-engine";
import { ratio } from "@rtnads/domain";

/**
 * Framework-agnostic tool definitions for the Ads Analytics MCP.
 *
 * Each tool is a THIN adapter: it enforces the read-only capability, delegates to
 * the deterministic Analytics Engine, and returns structured JSON. No business
 * logic or numeric computation lives here (docs/04 rules 1 & 4). Tests exercise
 * these handlers directly; server.ts registers them on an McpServer.
 */

export class AuthzError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthzError";
  }
}

function requireCapability(authz: z.infer<typeof Authz>, cap: string): void {
  if (!authz.capabilities.includes(cap)) {
    throw new AuthzError(`missing capability: ${cap}`);
  }
}

export const PROVENANCE = "analytics-engine@0.1.0";

export interface ToolContext {
  engine: AnalyticsEngine;
  /** Optional benchmark engine; enables the cohort/anomaly tools when present. */
  benchmark?: BenchmarkEngine;
  /** Injectable clock so responses are testable; defaults to wall time. */
  now?: () => string;
}

export function requireCap(
  authz: z.infer<typeof Authz>,
  cap: string,
): void {
  requireCapability(authz, cap);
}

export function makeResponseMeta(
  ctx: ToolContext,
  window: z.infer<typeof DateWindow>,
): z.infer<typeof ResponseMeta> {
  return makeMeta(ctx, window);
}

function makeMeta(
  ctx: ToolContext,
  window: z.infer<typeof DateWindow>,
): z.infer<typeof ResponseMeta> {
  return {
    computed_at: (ctx.now ?? (() => new Date().toISOString()))(),
    evidence_window: window,
    provenance: PROVENANCE,
  };
}

export interface ToolDef<I extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  name: string;
  title: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  handle(ctx: ToolContext, input: z.infer<I>): Promise<z.infer<O>>;
}

// ── shared input ────────────────────────────────────────────────────────────
const AnalyzeInput = z.object({
  authz: Authz,
  entity: EntityRef,
  window: DateWindow,
  model: UnitEconomicsModel.default("health_tourism"),
});

// ── calculate_unit_economics ────────────────────────────────────────────────
const UnitEconomicsOutput = z.object({
  unit_economics: UnitEconomics,
  meta: ResponseMeta,
});

export const calculateUnitEconomics: ToolDef<
  typeof AnalyzeInput,
  typeof UnitEconomicsOutput
> = {
  name: "calculate_unit_economics",
  title: "Calculate unit economics",
  description:
    "Business-specific unit economics for an entity (Health Tourism: cost per qualified lead, cost per booking, CAC, revenue per lead — not CPL alone).",
  inputSchema: AnalyzeInput,
  outputSchema: UnitEconomicsOutput,
  async handle(ctx, input) {
    requireCapability(input.authz, "ads.read");
    const a = await ctx.engine.analyze(
      input.authz.client_id,
      input.entity,
      input.window,
      input.model,
    );
    return { unit_economics: a.unit_economics, meta: makeMeta(ctx, input.window) };
  },
};

// ── get_entity_metrics ──────────────────────────────────────────────────────
const EntityMetricsOutput = z.object({
  entity: EntityRef,
  totals: MetricTotals,
  derived: DerivedMetrics,
  meta: ResponseMeta,
});

export const getEntityMetrics: ToolDef<
  typeof AnalyzeInput,
  typeof EntityMetricsOutput
> = {
  name: "get_entity_metrics",
  title: "Get entity metrics",
  description:
    "Aggregated totals and derived ratios (CTR, CPC, CPL, CPA, ROAS) for an advertising entity over a window.",
  inputSchema: AnalyzeInput,
  outputSchema: EntityMetricsOutput,
  async handle(ctx, input) {
    requireCapability(input.authz, "ads.read");
    const a = await ctx.engine.analyze(
      input.authz.client_id,
      input.entity,
      input.window,
      input.model,
    );
    return {
      entity: input.entity,
      totals: a.totals,
      derived: a.derived,
      meta: makeMeta(ctx, input.window),
    };
  },
};

// ── get_sales_performance ───────────────────────────────────────────────────
const SalesPerformanceOutput = z.object({
  entity: EntityRef,
  funnel: FunnelResult,
  roas: z.number().nullable(),
  revenue_per_lead: Money.nullable(),
  close_rate: z.number().nullable(),
  meta: ResponseMeta,
});

export const getSalesPerformance: ToolDef<
  typeof AnalyzeInput,
  typeof SalesPerformanceOutput
> = {
  name: "get_sales_performance",
  title: "Get sales performance",
  description:
    "Full funnel (Ad → … → Sale → Revenue), ROAS, revenue per lead and close rate for an entity — the business-outcome view.",
  inputSchema: AnalyzeInput,
  outputSchema: SalesPerformanceOutput,
  async handle(ctx, input) {
    requireCapability(input.authz, "ads.read");
    const a = await ctx.engine.analyze(
      input.authz.client_id,
      input.entity,
      input.window,
      input.model,
    );
    const count = (k: string) =>
      a.funnel.stages.find((s) => s.key === k)?.count ?? 0;
    const close_rate = ratio(count("sale"), count("qualified"));
    return {
      entity: input.entity,
      funnel: a.funnel,
      roas: a.unit_economics.roas,
      revenue_per_lead: a.unit_economics.revenue_per_lead,
      close_rate,
      meta: makeMeta(ctx, input.window),
    };
  },
};

/** All read-only tools exposed by the Ads Analytics MCP (M1 subset). */
export const ADS_ANALYTICS_TOOLS = [
  calculateUnitEconomics,
  getEntityMetrics,
  getSalesPerformance,
] as const;
