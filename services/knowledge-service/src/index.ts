/**
 * @rtnads/knowledge-service — Strategy Memory store & API.
 *
 * Persists the learning loop's calibration suggestions and enforces the human
 * accept/reject gate before any of them could change RTN's rules or weights
 * (docs/07 §knowledge-service, docs/08 Flow E).
 */
export type { LearningSuggestionStore, UpsertPendingInput, Decision } from "./types.js";
export { InMemoryLearningStore } from "./memory.js";
export { PgLearningSuggestionStore } from "./pg.js";
export { LearningSuggestionSink } from "./sink.js";
