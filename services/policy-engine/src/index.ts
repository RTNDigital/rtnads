/**
 * @rtnads/policy-engine — the L6 deterministic, unbypassable policy gate.
 *
 * Every proposed platform mutation is evaluated here; the AI cannot circumvent
 * it and it fails closed (docs/09 §5, docs/10, docs/11 §8).
 */
export * from "./evaluate.js";
export * from "./engine.js";
