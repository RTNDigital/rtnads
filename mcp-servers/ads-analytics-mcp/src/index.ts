/**
 * @rtnads/ads-analytics-mcp — the read-only Ads Analytics MCP domain.
 *
 * A thin adapter that exposes the deterministic Analytics Engine as typed MCP
 * tools. The AI reaches analytics ONLY through this boundary; it never touches
 * the warehouse or computes numbers (docs/04, docs/05 §A).
 */
export * from "./tools.js";
export * from "./tools-benchmark.js";
export * from "./server.js";
