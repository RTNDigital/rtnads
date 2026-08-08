import { makeEvent, type InMemoryEventBus, type Subscription } from "@rtnads/eventbus";
import type { VirtualClock } from "./clock.js";

/**
 * Ingestion scheduling (docs/08 Flow A). The scheduler owns *cadence only*: on each
 * tick it publishes `ingest.sync.started` and re-arms the next tick. The actual
 * connector work is a decoupled consumer (`registerSyncWorker`) that reacts to that
 * event and publishes `ingest.sync.completed` — so slow syncs never block the
 * scheduler, matching the queue-decoupled design (docs/08 §10).
 *
 * All identity/time comes from injected `newId` and `VirtualClock`, so a run is
 * fully deterministic.
 */

export interface SyncWindow {
  start: string;
  end: string;
}

export interface SyncStats {
  records: number;
  [k: string]: unknown;
}

export type RunSync = (clientId: string, window: SyncWindow) => SyncStats | Promise<SyncStats>;

export class IngestionScheduler {
  constructor(
    private readonly bus: InMemoryEventBus,
    private readonly clock: VirtualClock,
    private readonly newId: () => string,
  ) {}

  /**
   * Fire the first sync at `firstAtIso`, then every `intervalMs`. `windowFor` maps
   * a fire time to the sync window to request. Returns the first timer's id.
   */
  scheduleRecurring(
    clientId: string,
    firstAtIso: string,
    intervalMs: number,
    windowFor: (fireAtIso: string) => SyncWindow,
  ): string {
    if (intervalMs <= 0) throw new Error("intervalMs must be > 0");
    const fire = (): void => {
      const at = this.clock.now();
      this.bus.publish(
        makeEvent({
          event_id: this.newId(),
          type: "ingest.sync.started",
          occurred_at: at,
          client_id: clientId,
          correlation_id: this.newId(),
          causation_id: null,
          actor: { kind: "system", id: "ingestion-scheduler" },
          payload: { window: windowFor(at) },
        }),
      );
      this.clock.schedule(new Date(this.clock.nowMs() + intervalMs).toISOString(), fire);
    };
    return this.clock.schedule(firstAtIso, fire);
  }
}

/**
 * The connector-side consumer: on `ingest.sync.started`, run the sync and publish
 * `ingest.sync.completed { window, stats }`, linked to the start event by
 * `causation_id` and sharing its `correlation_id` (docs/08 §9 causation chain).
 * Handlers may be async, so `runSync` can do real I/O in production.
 */
export function registerSyncWorker(
  bus: InMemoryEventBus,
  newId: () => string,
  runSync: RunSync,
): Subscription {
  return bus.subscribe(
    "ingest.sync.started",
    async (e) => {
      const window = e.payload.window as SyncWindow;
      const stats = await runSync(e.client_id, window);
      bus.publish(
        makeEvent({
          event_id: newId(),
          type: "ingest.sync.completed",
          occurred_at: e.occurred_at,
          client_id: e.client_id,
          correlation_id: e.correlation_id,
          causation_id: e.event_id,
          actor: { kind: "system", id: "connector" },
          payload: { window, stats },
        }),
      );
    },
    "sync-worker",
  );
}
