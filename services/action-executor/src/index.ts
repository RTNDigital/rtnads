/**
 * @rtnads/action-executor — the L6 execution + audit substrate.
 *
 * Executes only approved, policy-passed actions; captures immutable pre/post
 * state; supports rollback; and appends to an append-only, hash-chained audit
 * log (docs/07 §Action Executor, docs/09 §8, docs/11 §8).
 */
export * from "./audit.js";
export * from "./executor.js";
export * from "./outcome.js";
export * from "./pg-audit.js";
export * from "./pg-control.js";
