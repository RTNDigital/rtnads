/**
 * @rtnads/contracts — the single source of truth for boundary contracts.
 *
 * Every MCP tool I/O, internal service API payload and event is defined here as a
 * Zod schema and exported as both a runtime validator and a static type. Servers,
 * clients and the UI import from here so contracts cannot drift
 * (docs/06-api-boundaries.md §4, docs/12-repository-structure.md §3).
 */
export * from "./common.js";
export * from "./taxonomy.js";
export * from "./warehouse.js";
export * from "./crm.js";
export * from "./analytics.js";
export * from "./policy.js";
export * from "./control.js";
export * from "./rbac.js";
export * from "./recommendation.js";
export * from "./knowledge.js";
export * from "./events.js";
export * as AdsAnalyticsMcp from "./mcp/analytics.js";
