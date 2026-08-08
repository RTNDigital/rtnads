import { describe, it, expect } from "vitest";
import { InMemoryEventBus, makeEvent } from "@rtnads/eventbus";
import {
  VirtualClock,
  parseIsoDuration,
  IngestionScheduler,
  registerSyncWorker,
  OutcomeWindowScheduler,
} from "./index.js";

const CID = "11111111-1111-1111-1111-111111111111";

let n = 0;
function nextId(): string {
  n += 1;
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

describe("parseIsoDuration", () => {
  it("parses days, weeks, hours/minutes/seconds", () => {
    expect(parseIsoDuration("P14D")).toBe(14 * 86400_000);
    expect(parseIsoDuration("P1W")).toBe(7 * 86400_000);
    expect(parseIsoDuration("PT12H")).toBe(12 * 3600_000);
    expect(parseIsoDuration("P1DT2H30M")).toBe((86400 + 2 * 3600 + 30 * 60) * 1000);
  });
  it("rejects empty, month/year and garbage", () => {
    expect(() => parseIsoDuration("P")).toThrow();
    expect(() => parseIsoDuration("PT")).toThrow();
    expect(() => parseIsoDuration("P1M")).toThrow(); // months ambiguous → unsupported
    expect(() => parseIsoDuration("14D")).toThrow();
  });
});

describe("VirtualClock", () => {
  it("fires due timers in (fireAt, insertion) order and updates now() to fire time", () => {
    const c = new VirtualClock("2026-08-08T00:00:00.000Z");
    const log: string[] = [];
    c.schedule("2026-08-08T02:00:00.000Z", () => log.push(`b@${c.now()}`));
    c.schedule("2026-08-08T01:00:00.000Z", () => log.push(`a@${c.now()}`));
    c.schedule("2026-08-09T00:00:00.000Z", () => log.push("later")); // not yet due
    c.advanceTo("2026-08-08T03:00:00.000Z");
    expect(log).toEqual(["a@2026-08-08T01:00:00.000Z", "b@2026-08-08T02:00:00.000Z"]);
    expect(c.now()).toBe("2026-08-08T03:00:00.000Z");
    expect(c.pending()).toHaveLength(1); // the "later" timer
  });

  it("cancels a timer and refuses to run backwards", () => {
    const c = new VirtualClock("2026-08-08T00:00:00.000Z");
    let fired = false;
    const id = c.schedule("2026-08-08T01:00:00.000Z", () => (fired = true));
    expect(c.cancel(id)).toBe(true);
    c.advanceBy(3600_000);
    expect(fired).toBe(false);
    expect(() => c.advanceTo("2026-08-07T00:00:00.000Z")).toThrow();
  });
});

describe("IngestionScheduler (Flow A)", () => {
  it("emits ingest.sync.started on each interval and the worker completes each one", async () => {
    const bus = new InMemoryEventBus();
    const clock = new VirtualClock("2026-08-08T00:00:00.000Z");
    const scheduler = new IngestionScheduler(bus, clock, nextId);

    const syncedWindows: string[] = [];
    registerSyncWorker(bus, nextId, (_clientId, w) => {
      syncedWindows.push(`${w.start}..${w.end}`);
      return { records: 3 };
    });

    const day = 86400_000;
    scheduler.scheduleRecurring(CID, "2026-08-08T06:00:00.000Z", day, (at) => ({
      start: at.slice(0, 10),
      end: at.slice(0, 10),
    }));

    // Advance three days → three ticks.
    clock.advanceTo("2026-08-10T12:00:00.000Z");
    await bus.drain();

    const started = bus.delivered.filter((e) => e.type === "ingest.sync.started");
    const completed = bus.delivered.filter((e) => e.type === "ingest.sync.completed");
    expect(started).toHaveLength(3);
    expect(completed).toHaveLength(3);
    // completed is caused by started and shares its correlation id
    expect(completed[0]!.causation_id).toBe(started[0]!.event_id);
    expect(completed[0]!.correlation_id).toBe(started[0]!.correlation_id);
    expect((completed[0]!.payload.stats as { records: number }).records).toBe(3);
    expect(syncedWindows).toEqual(["2026-08-08..2026-08-08", "2026-08-09..2026-08-09", "2026-08-10..2026-08-10"]);
  });
});

describe("OutcomeWindowScheduler (Flow E)", () => {
  function executed(actionRecordId: string, period: string, executedAt: string) {
    return makeEvent({
      event_id: nextId(),
      type: "action.executed",
      occurred_at: executedAt,
      client_id: CID,
      correlation_id: CID,
      causation_id: null,
      actor: { kind: "system", id: "action-executor" },
      payload: { action_record_id: actionRecordId, recommended_observation_period: period, executed_at: executedAt },
    });
  }

  it("opens the outcome window exactly at executed_at + observation period", async () => {
    const bus = new InMemoryEventBus();
    const clock = new VirtualClock("2026-08-08T00:00:00.000Z");
    new OutcomeWindowScheduler(bus, clock, nextId).register();

    await bus.emit(executed("ar-1", "P14D", "2026-08-08T00:00:00.000Z"));

    // Before the window: nothing opened.
    clock.advanceTo("2026-08-21T23:59:59.000Z");
    await bus.drain();
    expect(bus.delivered.some((e) => e.type === "outcome.window.opened")).toBe(false);

    // At t + 14d: the window opens once.
    clock.advanceTo("2026-08-22T00:00:00.000Z");
    await bus.drain();
    const opened = bus.delivered.filter((e) => e.type === "outcome.window.opened");
    expect(opened).toHaveLength(1);
    expect(opened[0]!.payload.action_record_id).toBe("ar-1");
    expect(opened[0]!.causation_id).toBeTruthy();
    expect(opened[0]!.occurred_at).toBe("2026-08-22T00:00:00.000Z");
  });

  it("is idempotent: a redelivered action.executed does not open a second window", async () => {
    const bus = new InMemoryEventBus();
    const clock = new VirtualClock("2026-08-08T00:00:00.000Z");
    const ows = new OutcomeWindowScheduler(bus, clock, nextId);
    ows.register();

    const e = executed("ar-2", "P7D", "2026-08-08T00:00:00.000Z");
    await bus.emit(e);
    await bus.emit(e); // redelivery
    expect(ows.pending()).toHaveLength(1);

    clock.advanceTo("2026-08-15T00:00:00.000Z");
    await bus.drain();
    expect(bus.delivered.filter((x) => x.type === "outcome.window.opened")).toHaveLength(1);
  });
});
