import type { InMemoryEventBus, Subscription } from "@rtnads/eventbus";
import type { EventEnvelope } from "@rtnads/contracts";
import type { LearningSuggestionStore } from "./types.js";

/**
 * Bridges the learning loop to Strategy Memory (docs/08 Flow E): each
 * `learning.updated` calibration snapshot is persisted as a PENDING suggestion for
 * the client, superseding the previous pending one. Nothing here changes rules or
 * weights — a human must accept the suggestion first. Idempotent on redelivery via
 * the store's source-event dedupe.
 */
export class LearningSuggestionSink {
  constructor(
    private readonly bus: InMemoryEventBus,
    private readonly store: LearningSuggestionStore,
  ) {}

  register(): Subscription {
    return this.bus.subscribe("learning.updated", (e) => this.onLearningUpdated(e), "learning-suggestion-sink");
  }

  private async onLearningUpdated(e: EventEnvelope): Promise<void> {
    await this.store.upsertPending({
      clientId: e.client_id,
      snapshot: e.payload,
      sourceEventId: e.event_id,
      kind: "calibration",
    });
  }
}
