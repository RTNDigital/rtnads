/**
 * @rtnads/domain — pure, reproducible domain helpers.
 *
 * Nothing here performs I/O, calls an LLM, or reads a clock. These functions are
 * the reusable core of the deterministic intelligence layer (docs/07 §L3).
 */
export * from "./similarity.js";
export * from "./taxonomy.js";
