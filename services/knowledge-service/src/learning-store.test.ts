import { describe, it, expect } from "vitest";
import { InMemoryEventBus, makeEvent } from "@rtnads/eventbus";
import { InMemoryLearningStore, LearningSuggestionSink } from "./index.js";

const CID = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

let n = 0;
function nextId(): string {
  n += 1;
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}
let t = 0;
function now(): string {
  t += 1;
  return new Date(Date.parse("2026-08-22T00:00:00.000Z") + t * 1000).toISOString();
}

function learningUpdated(clientId: string, sampleSize: number, id = nextId()) {
  return makeEvent({
    event_id: id,
    type: "learning.updated",
    occurred_at: "2026-08-22T00:00:00.000Z",
    client_id: clientId,
    correlation_id: CID,
    causation_id: null,
    actor: { kind: "system", id: "learning-aggregator" },
    payload: { sample_size: sampleSize, result_counts: { improved: sampleSize, neutral: 0, regressed: 0, inconclusive: 0 }, mean_causal_confidence: 0.4 },
  });
}

describe("InMemoryLearningStore", () => {
  it("keeps at most one pending suggestion per client — newer supersedes older", async () => {
    const store = new InMemoryLearningStore(now, nextId);
    await store.upsertPending({ clientId: CID, snapshot: { sample_size: 1 } });
    await store.upsertPending({ clientId: CID, snapshot: { sample_size: 2 } });

    const pending = await store.list(CID, "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.snapshot.sample_size).toBe(2);
    expect(await store.list(CID, "superseded")).toHaveLength(1);
  });

  it("dedupes by source event id (idempotent redelivery)", async () => {
    const store = new InMemoryLearningStore(now, nextId);
    const evt = "aaaaaaaa-0000-4000-8000-000000000e01";
    const first = await store.upsertPending({ clientId: CID, snapshot: { s: 1 }, sourceEventId: evt });
    const dup = await store.upsertPending({ clientId: CID, snapshot: { s: 1 }, sourceEventId: evt });
    expect(first).not.toBeNull();
    expect(dup).toBeNull();
    expect(await store.list(CID)).toHaveLength(1);
  });

  it("accepts a pending suggestion and refuses a second decision", async () => {
    const store = new InMemoryLearningStore(now, nextId);
    const s = (await store.upsertPending({ clientId: CID, snapshot: { s: 1 } }))!;
    const accepted = await store.decide(CID, s.id, "accepted", "user:lead", "ship it");
    expect(accepted.status).toBe("accepted");
    expect(accepted.decided_by).toBe("user:lead");
    expect(accepted.note).toBe("ship it");
    await expect(store.decide(CID, s.id, "rejected", "user:lead")).rejects.toThrow(/cannot decide/);
  });

  it("isolates clients", async () => {
    const store = new InMemoryLearningStore(now, nextId);
    const mine = (await store.upsertPending({ clientId: CID, snapshot: { s: 1 } }))!;
    await store.upsertPending({ clientId: OTHER, snapshot: { s: 9 } });
    expect(await store.get(OTHER, mine.id)).toBeNull(); // cross-tenant invisible
    expect(await store.list(OTHER)).toHaveLength(1);
  });
});

describe("LearningSuggestionSink", () => {
  it("persists learning.updated events as pending suggestions, latest wins", async () => {
    const bus = new InMemoryEventBus();
    const store = new InMemoryLearningStore(now, nextId);
    new LearningSuggestionSink(bus, store).register();

    await bus.emit(learningUpdated(CID, 1));
    await bus.emit(learningUpdated(CID, 3));

    const pending = await store.list(CID, "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.snapshot.sample_size).toBe(3);
    expect(pending[0]!.kind).toBe("calibration");
  });

  it("is idempotent when the same learning.updated is redelivered", async () => {
    const bus = new InMemoryEventBus();
    const store = new InMemoryLearningStore(now, nextId);
    new LearningSuggestionSink(bus, store).register();
    const e = learningUpdated(CID, 2);
    await bus.emit(e);
    await bus.emit(e);
    expect(await store.list(CID)).toHaveLength(1);
  });
});
