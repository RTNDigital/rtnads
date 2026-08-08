/**
 * @rtnads/classifier — deterministic context classification (L2/L3).
 *
 * Assigns the campaign context vector from ingested facts + rule-derived signals,
 * sourced and confidence-scored for auditability. The context vector is the input
 * to cohort selection (docs/02 §4–5).
 */
export * from "./rules.js";
export * from "./loader.js";
