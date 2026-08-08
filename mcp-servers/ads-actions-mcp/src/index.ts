/**
 * @rtnads/ads-actions-mcp — the controlled-mutation MCP domain.
 *
 * Exposes preview (pure) and write (gated) tools. Every write routes through the
 * deterministic Policy Engine and returns a status; execution happens later in
 * the Control plane, never here (docs/04 §2.4, docs/05 §D).
 */
export * from "./tools.js";
export * from "./server.js";
