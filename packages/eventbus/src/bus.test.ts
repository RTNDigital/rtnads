import { describe, it, expect } from "vitest";
import { InMemoryEventBus, typeMatches, makeEvent } from "./index.js";

const CID = "11111111-1111-1111-1111-111111111111";

let n = 0;
/** Deterministic uuid-shaped id generator for tests (no Math.random). */
function nextId(): string {
  n += 1;
  const h = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${h}`;
}

function ev(type: string, payload: Record<string, unknown> = {}, id = nextId()) {
  return makeEvent({
    event_id: id,
    type,
    occurred_at: "2026-08-08T00:00:00.000Z",
    client_id: CID,
    correlation_id: CID,
    causation_id: null,
    actor: { kind: "system", id: "test" },
    payload,
  });
}

describe("typeMatches", () => {
  it("matches exact, family wildcard and catch-all; not siblings", () => {
    expect(typeMatches("outcome.evaluated", "outcome.evaluated")).toBe(true);
    expect(typeMatches("outcome.*", "outcome.evaluated")).toBe(true);
    expect(typeMatches("outcome.*", "outcome")).toBe(true);
    expect(typeMatches("*", "anything.at.all")).toBe(true);
    expect(typeMatches("outcome.*", "outcomes.evaluated")).toBe(false);
    expect(typeMatches("ingest.sync.started", "ingest.sync.completed")).toBe(false);
  });
});

describe("InMemoryEventBus", () => {
  it("delivers matching events FIFO in publish order", async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe("ingest.*", (e) => void seen.push(`${e.type}:${String(e.payload.k)}`));
    bus.publish(ev("ingest.sync.started", { k: 1 }));
    bus.publish(ev("warehouse.facts.updated", { k: 99 })); // not matched
    bus.publish(ev("ingest.sync.completed", { k: 2 }));
    await bus.drain();
    expect(seen).toEqual(["ingest.sync.started:1", "ingest.sync.completed:2"]);
    expect(bus.pending).toBe(0);
  });

  it("is idempotent per subscription on repeated event_id (at-least-once)", async () => {
    const bus = new InMemoryEventBus();
    let count = 0;
    bus.subscribe("action.executed", () => void count++);
    const e = ev("action.executed");
    await bus.emit(e);
    await bus.emit(e); // redelivery of the same event_id
    await bus.emit({ ...e }); // structurally identical, same id
    expect(count).toBe(1);
  });

  it("processes events published by handlers within the same drain (reaction chain)", async () => {
    const bus = new InMemoryEventBus();
    const order: string[] = [];
    bus.subscribe("a.start", () => {
      order.push("a");
      bus.publish(ev("b.next"));
    });
    bus.subscribe("b.next", () => void order.push("b"));
    bus.publish(ev("a.start"));
    await bus.drain();
    expect(order).toEqual(["a", "b"]);
  });

  it("dead-letters a handler that keeps throwing, after maxRetries, without blocking others", async () => {
    const bus = new InMemoryEventBus({ maxRetries: 2 });
    const good: string[] = [];
    bus.subscribe("x", () => {
      throw new Error("boom");
    }, "poison");
    bus.subscribe("x", (e) => void good.push(e.type), "healthy");
    await bus.emit(ev("x"));
    expect(good).toEqual(["x"]); // the healthy subscription still ran
    expect(bus.deadLetters).toHaveLength(1);
    expect(bus.deadLetters[0]!.subscription).toBe("poison");
    expect(bus.deadLetters[0]!.attempts).toBe(3); // 1 initial + 2 retries
    expect(bus.deadLetters[0]!.error).toBe("boom");
  });

  it("does not redeliver a dead-lettered event on republish", async () => {
    const bus = new InMemoryEventBus({ maxRetries: 0 });
    let attempts = 0;
    bus.subscribe("x", () => {
      attempts++;
      throw new Error("nope");
    });
    const e = ev("x");
    await bus.emit(e);
    await bus.emit(e);
    expect(attempts).toBe(1);
    expect(bus.deadLetters).toHaveLength(1);
  });

  it("rejects a malformed envelope at publish (contract validation)", () => {
    const bus = new InMemoryEventBus();
    expect(() => bus.publish({ type: "bad" } as never)).toThrow();
  });
});
