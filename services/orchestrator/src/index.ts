/**
 * @rtnads/orchestrator — the L5 AI Orchestrator.
 *
 * Authors recommendation narratives over deterministic evidence via a
 * model-agnostic provider, enforces that the LLM introduces no ungrounded
 * numbers, and assembles the full Recommendation with provider provenance. It
 * computes nothing and mutates nothing (docs/01 §6, docs/11 §6b).
 */
export * from "./numeric-guard.js";
export * from "./orchestrator.js";
