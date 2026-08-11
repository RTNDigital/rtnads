import { makeEvent, type InMemoryEventBus, type Subscription } from "@rtnads/eventbus";
import { parseIsoDuration } from "./duration.js";
import type { VirtualClock, PendingTimer } from "./clock.js";

/**
 * Outcome-window scheduling (docs/08 Flow E). Subscribes to `action.executed` and,
 * for each executed action, arms a timer to publish `outcome.window.opened` at
 * `executed_at + recommended_observation_period`. The Outcome Evaluator (L6) then
 * does the deterministic before/after comparison when that event lands.
 *
 * Idempotent: a redelivered `action.executed` for an action already scheduled is
 * ignored, so the learning loop never opens two windows for one action (docs/08 §9).
 * The pending timers are inspectable/persistable so a restart doesn't silently drop
 * a window (docs/08 §10).
 */
export class OutcomeWindowScheduler {
  private readonly scheduled = new Set<string>();

  constructor(
    private readonly bus: InMemoryEventBus,
    private readonly clock: VirtualClock,
    private readonly newId: () => string,
  ) {}

  /** Attach to the bus. Call once. */
  register(): Subscription {
    return this.bus.subscribe("action.executed", (e) => this.onExecuted(e), "outcome-window-scheduler");
  }

  /** Timers still waiting to open (safe to persist across restarts). */
  pending(): PendingTimer[] {
    return this.clock.pending();
  }

  private onExecuted(e: {
    client_id: string;
    event_id: string;
    correlation_id: string;
    occurred_at: string;
    payload: Record<string, unknown>;
  }): void {
    const actionRecordId = asString(e.payload.action_record_id);
    const period = asString(e.payload.recommended_observation_period);
    if (!actionRecordId || !period) return; // not enough to schedule a window
    if (this.scheduled.has(actionRecordId)) return; // idempotent

    const executedAt = asString(e.payload.executed_at) ?? e.occurred_at;
    const executedMs = Date.parse(executedAt);
    if (Number.isNaN(executedMs)) return;

    const fireAt = new Date(executedMs + parseIsoDuration(period)).toISOString();
    this.scheduled.add(actionRecordId);
    this.clock.schedule(fireAt, () => {
      this.bus.publish(
        makeEvent({
          event_id: this.newId(),
          type: "outcome.window.opened",
          occurred_at: this.clock.now(),
          client_id: e.client_id,
          correlation_id: e.correlation_id,
          causation_id: e.event_id,
          actor: { kind: "system", id: "outcome-window-scheduler" },
          payload: {
            action_record_id: actionRecordId,
            evaluation_window: { period, opened_at: this.clock.now() },
          },
        }),
      );
    });
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
