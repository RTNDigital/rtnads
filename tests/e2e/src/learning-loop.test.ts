import { describe, it, expect } from "vitest";
import { InMemoryEventBus, makeEvent } from "@rtnads/eventbus";
import { VirtualClock, OutcomeWindowScheduler } from "@rtnads/ingestion-scheduler";
import {
  OutcomeEvaluatorConsumer,
  LearningAggregator,
  type OutcomeMetricsSource,
} from "@rtnads/action-executor";

/**
 * End-to-end Flow E (docs/08 §8) over the in-memory event bus, fully deterministic:
 *
 *   action.executed
 *     → OutcomeWindowScheduler opens outcome.window.opened at t + observation period
 *     → OutcomeEvaluatorConsumer reads before/after, emits outcome.evaluated
 *     → LearningAggregator emits a learning.updated calibration snapshot
 *
 * Numbers are computed deterministically end-to-end; no LLM touches them, and the
 * whole chain settles by advancing a virtual clock.
 */
describe("Flow E — outcome & learning loop", () => {
  const CID = "11111111-1111-1111-1111-111111111111";
  let n = 0;
  const nextId = () => {
    n += 1;
    return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  };

  it("turns an executed action into an evaluated outcome and a learning snapshot", async () => {
    const bus = new InMemoryEventBus();
    const clock = new VirtualClock("2026-08-08T00:00:00.000Z");

    // CPL improved from £9.00 → £6.00 (900 → 600 minor units, lower is better).
    const metrics: OutcomeMetricsSource = {
      read: async () => ({ metric: "cpl_minor", before: 900, after: 600, lowerIsBetter: true }),
    };

    new OutcomeWindowScheduler(bus, clock, nextId).register();
    new OutcomeEvaluatorConsumer(bus, metrics, nextId, () => clock.now()).register();
    const learning = new LearningAggregator(bus, nextId, () => clock.now());
    learning.register();

    // The Action Executor reports an executed action with a 14-day observation period.
    await bus.emit(
      makeEvent({
        event_id: nextId(),
        type: "action.executed",
        occurred_at: "2026-08-08T00:00:00.000Z",
        client_id: CID,
        correlation_id: CID,
        causation_id: null,
        actor: { kind: "system", id: "action-executor" },
        payload: {
          action_record_id: "aaaaaaaa-0000-4000-8000-000000000001",
          recommended_observation_period: "P14D",
          executed_at: "2026-08-08T00:00:00.000Z",
        },
      }),
    );

    // Nothing evaluated before the window closes.
    clock.advanceTo("2026-08-21T00:00:00.000Z");
    await bus.drain();
    expect(bus.delivered.some((e) => e.type === "outcome.evaluated")).toBe(false);

    // At t + 14d the window opens and the whole chain settles.
    clock.advanceTo("2026-08-22T00:00:00.000Z");
    await bus.drain();

    const evaluated = bus.delivered.filter((e) => e.type === "outcome.evaluated");
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0]!.payload.result).toBe("improved");

    expect(learning.snapshot()).toEqual({
      sample_size: 1,
      result_counts: { improved: 1, neutral: 0, regressed: 0, inconclusive: 0 },
      mean_causal_confidence: expect.any(Number),
    });

    // Causation chain is intact: executed → window.opened → evaluated → learning.updated.
    const learningUpdated = bus.delivered.find((e) => e.type === "learning.updated");
    expect(learningUpdated?.causation_id).toBe(evaluated[0]!.event_id);
  });
});
