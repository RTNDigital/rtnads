import { LearningSuggestion, type LearningSuggestionStatus } from "@rtnads/contracts";
import type { LearningSuggestionStore, UpsertPendingInput, Decision } from "./types.js";

/**
 * In-memory Strategy Memory store — the deterministic, offline substitute for the
 * Postgres store, with identical semantics (supersede-on-upsert, dedupe by source
 * event, terminal decisions). Time and ids are injected so runs are reproducible.
 */
export class InMemoryLearningStore implements LearningSuggestionStore {
  private readonly rows: LearningSuggestion[] = [];

  constructor(
    private readonly now: () => string,
    private readonly newId: () => string,
  ) {}

  async upsertPending(input: UpsertPendingInput): Promise<LearningSuggestion | null> {
    const { clientId, snapshot, sourceEventId = null, kind = "calibration" } = input;
    if (sourceEventId && this.rows.some((r) => r.client_id === clientId && r.source_event_id === sourceEventId)) {
      return null; // already recorded this event
    }
    for (const r of this.rows) {
      if (r.client_id === clientId && r.status === "pending") r.status = "superseded";
    }
    const row = LearningSuggestion.parse({
      id: this.newId(),
      client_id: clientId,
      created_at: this.now(),
      status: "pending",
      kind,
      snapshot,
      source_event_id: sourceEventId,
      note: null,
      decided_by: null,
      decided_at: null,
    });
    this.rows.push(row);
    return row;
  }

  async list(clientId: string, status?: LearningSuggestionStatus): Promise<LearningSuggestion[]> {
    return this.rows
      .filter((r) => r.client_id === clientId && (!status || r.status === status))
      .slice()
      .reverse(); // newest first (insertion order)
  }

  async get(clientId: string, id: string): Promise<LearningSuggestion | null> {
    return this.rows.find((r) => r.client_id === clientId && r.id === id) ?? null;
  }

  async decide(clientId: string, id: string, decision: Decision, decidedBy: string, note?: string): Promise<LearningSuggestion> {
    const r = this.rows.find((x) => x.client_id === clientId && x.id === id);
    if (!r) throw new Error("learning suggestion not found");
    if (r.status !== "pending") throw new Error(`cannot decide a ${r.status} suggestion`);
    r.status = decision;
    r.decided_by = decidedBy;
    r.decided_at = this.now();
    if (note !== undefined) r.note = note;
    return r;
  }
}
