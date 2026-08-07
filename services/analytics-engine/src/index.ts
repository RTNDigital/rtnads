/**
 * @rtnads/analytics-engine — L3 deterministic analytics.
 *
 * Pure metrics, funnel and unit-economics computation over warehouse facts and
 * CRM outcomes. No LLM, no I/O in the math. The AI reads these results via the
 * Ads Analytics MCP; it never computes them (docs/01 §6, docs/04).
 */
export * from "./types.js";
export * from "./compute.js";
export * from "./engine.js";
export * from "./memory-repo.js";
export * from "./pg-repo.js";
