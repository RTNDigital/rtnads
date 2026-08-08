import type { LearningSuggestion, LearningSuggestionStatus } from "@rtnads/contracts";

/**
 * Strategy Memory store port for learning suggestions (docs/08 Flow E). Two
 * invariants encode the human-in-the-loop gate:
 *   • at most one PENDING suggestion per client — a newer snapshot supersedes the
 *     older pending one, so a human always reviews the latest calibration;
 *   • only a `pending` suggestion can be decided, and a decision is terminal.
 */

export interface UpsertPendingInput {
  clientId: string;
  snapshot: Record<string, unknown>;
  sourceEventId?: string | null;
  kind?: string;
}

export type Decision = Extract<LearningSuggestionStatus, "accepted" | "rejected">;

export interface LearningSuggestionStore {
  /**
   * Record the latest calibration snapshot as a pending suggestion, superseding any
   * prior pending one for the client. Returns null if this source event was already
   * recorded (idempotent on redelivery).
   */
  upsertPending(input: UpsertPendingInput): Promise<LearningSuggestion | null>;
  list(clientId: string, status?: LearningSuggestionStatus): Promise<LearningSuggestion[]>;
  get(clientId: string, id: string): Promise<LearningSuggestion | null>;
  /** Human accept/reject. Throws if the suggestion is missing or already decided. */
  decide(clientId: string, id: string, decision: Decision, decidedBy: string, note?: string): Promise<LearningSuggestion>;
}
