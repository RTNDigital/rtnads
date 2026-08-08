/**
 * @rtnads/crm-mcp — the read-only, anonymized CRM MCP domain (docs/04 §2.3).
 *
 * Exposes lead-quality distributions, funnel conversion and sales outcomes as
 * aggregates and bands only. PII is never expressible through these contracts.
 */
export * from "./types.js";
export * from "./memory-repo.js";
export * from "./pg-repo.js";
export * from "./server.js";
