/**
 * @rtnads/benchmark-engine — L3 deterministic benchmarking.
 *
 * Builds influence-weighted cohorts of historically similar RTN campaigns,
 * benchmarks a subject against them, and detects anomalies — all deterministic,
 * no LLM. The AI reads these via the Ads Analytics MCP (docs/02 §5, docs/04).
 */
export * from "./types.js";
export * from "./cohort.js";
export * from "./benchmark.js";
export * from "./anomaly.js";
export * from "./engine.js";
export * from "./memory-repo.js";
