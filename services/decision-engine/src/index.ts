/**
 * @rtnads/decision-engine — L3 deterministic decisioning.
 *
 * Benchmark + anomaly + rules → candidate recommendation drafts with confidence
 * and risk. No LLM, no narrative, no fabricated numbers (docs/07, docs/11 §6a).
 */
export * from "./types.js";
export * from "./confidence.js";
export * from "./rules.js";
export * from "./engine.js";
