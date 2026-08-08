import { describe, it, expect } from "vitest";
import { InMemoryEventBus, makeEvent } from "@rtnads/eventbus";
import {
  OutcomeEvaluatorConsumer,
  LearningAggregator,
  type OutcomeMetrics,
  type OutcomeMetricsSource,
} from "./outcome-consumer.js";

const CID = "11111111-1111-1111-1111-111111111111";

let n = 0;
function nextId(): string {
  n += 1;
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}
const now = () => "2026-08-22T00:00:00.000Z";

function windowOpened(actionRecordId: string, id = nextId()) {
  return makeEvent({
    event_id: id,
    type: "outcome.window.opened",
    occurred_at: "2026-08-22T00:00:00.000Z",
    client_id: CID,
    correlation_id: CID,
    causation_id: null,
    actor: { kind: "system", id: "outcome-window-scheduler" },
    payload: { action_record_id: actionRecordId, evaluation_window: { period: "P14D" } },
  });
}

/** A metrics source returning a fixed reading, or null to signal "not ready". */
function source(reading: OutcomeMetrics | null): OutcomeMetricsSource {
  return { read: async () => reading };
}

describe("OutcomeEvaluatorConsumer (Flow E)", () => {
  it("evaluates an opened window and emits outcome.evaluated with a deterministic verdict", async () => {
    const bus = new InMemoryEventBus();
    // CPL fell 900 → 600 (lower is better) → improved.
    new OutcomeEvaluatorConsumer(
      bus,
      source({ metric: "cpl_minor", before: 900, after: 600, lowerIsBetter: true }),
      nextId,
      now,
    ).register();

    await bus.emit(windowOpened("aaaaaaaa-0000-4000-8000-000000000001"));

    const evaluated = bus.delivered.filter((e) => e.type === "outcome.evaluated");
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0]!.payload.result).toBe("improved");
    expect(evaluated[0]!.payload.action_record_id).toBe("aaaaaaaa-0000-4000-8000-000000000001");
    // conservative causal confidence, hard-capped at 0.5
    expect(Number(evaluated[0]!.payload.causal_confidence)).toBeLessThanOrEqual(0.5);
    expect(evaluated[0]!.causation_id).toBeTruthy();
  });

  it("does not emit when metrics are not yet available", async () => {
    const bus = new InMemoryEventBus();
    new OutcomeEvaluatorConsumer(bus, source(null), nextId, now).register();
    await bus.emit(windowOpened("aaaaaaaa-0000-4000-8000-000000000002"));
    expect(bus.delivered.some((e) => e.type === "outcome.evaluated")).toBe(false);
  });

  it("is idempotent per action_record_id (no double evaluation on re-open)", async () => {
    const bus = new InMemoryEventBus();
    new OutcomeEvaluatorConsumer(
      bus,
      source({ metric: "roas", before: 2, after: 2.02, lowerIsBetter: false }),
      nextId,
      now,
    ).register();
    const opened = windowOpened("aaaaaaaa-0000-4000-8000-000000000003");
    await bus.emit(opened);
    await bus.emit(windowOpened("aaaaaaaa-0000-4000-8000-000000000003")); // re-open, different event id
    expect(bus.delivered.filter((e) => e.type === "outcome.evaluated")).toHaveLength(1);
  });
});

describe("LearningAggregator (Flow E)", () => {
  it("rolls outcome.evaluated events into a running learning.updated snapshot", async () => {
    const bus = new InMemoryEventBus();
    const agg = new LearningAggregator(bus, nextId, now);
    agg.register();

    const evaluators = [
      { result: "improved", causal_confidence: 0.4 },
      { result: "regressed", causal_confidence: 0.4 },
      { result: "neutral", causal_confidence: 0.1 },
    ];
    for (const ev of evaluators) {
      await bus.emit(
        makeEvent({
          event_id: nextId(),
          type: "outcome.evaluated",
          occurred_at: now(),
          client_id: CID,
          correlation_id: CID,
          causation_id: null,
          actor: { kind: "system", id: "outcome-evaluator" },
          payload: { id: nextId(), result: ev.result, causal_confidence: ev.causal_confidence },
        }),
      );
    }

    const snap = agg.snapshot();
    expect(snap.sample_size).toBe(3);
    expect(snap.result_counts).toEqual({ improved: 1, neutral: 1, regressed: 1, inconclusive: 0 });
    expect(snap.mean_causal_confidence).toBeCloseTo((0.4 + 0.4 + 0.1) / 3, 10);

    const updates = bus.delivered.filter((e) => e.type === "learning.updated");
    expect(updates).toHaveLength(3);
    expect((updates[2]!.payload as { sample_size: number }).sample_size).toBe(3);
  });
});
