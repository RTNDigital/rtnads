import { makeEvent, type InMemoryEventBus, type Subscription } from "@rtnads/eventbus";
import type { EventEnvelope } from "@rtnads/contracts";
import { evaluateOutcome } from "./outcome.js";

/**
 * Event-driven completion of the learning loop (docs/08 Flow E). The ingestion
 * scheduler opens an outcome window (`outcome.window.opened`) once an action's
 * observation period elapses; this consumer reacts to that event, reads the
 * before/after metrics for the action, runs the DETERMINISTIC `evaluateOutcome`
 * (no LLM, conservative causal confidence), and emits `outcome.evaluated`.
 *
 * A separate `LearningAggregator` rolls those evaluations into `learning.updated`
 * — a *suggestion* snapshot for Strategy Memory, never an automatic behavior change
 * (keeps the human-in-the-loop posture, docs/08 Flow E).
 */

/** The before/after reading the evaluator needs; supplied by an injected port. */
export interface OutcomeMetrics {
  metric: string;
  before: number;
  after: number;
  /** True for cost metrics (lower is better); false for ROAS/revenue. */
  lowerIsBetter: boolean;
  neutralBand?: number;
}

/**
 * Port over the warehouse/analytics read-path. Returns null when the metrics are
 * not yet available (e.g. facts for the after-window haven't landed) — the window
 * is then simply not evaluated, leaving it for a later re-open rather than
 * producing a wrong verdict.
 */
export interface OutcomeMetricsSource {
  read(actionRecordId: string, window: Record<string, unknown>): Promise<OutcomeMetrics | null>;
}

export class OutcomeEvaluatorConsumer {
  private readonly evaluated = new Set<string>();

  constructor(
    private readonly bus: InMemoryEventBus,
    private readonly source: OutcomeMetricsSource,
    private readonly newId: () => string,
    private readonly now: () => string,
  ) {}

  register(): Subscription {
    return this.bus.subscribe("outcome.window.opened", (e) => this.onOpened(e), "outcome-evaluator");
  }

  private async onOpened(e: EventEnvelope): Promise<void> {
    const actionRecordId = asString(e.payload.action_record_id);
    if (!actionRecordId || this.evaluated.has(actionRecordId)) return;

    const window = (e.payload.evaluation_window as Record<string, unknown> | undefined) ?? {};
    const metrics = await this.source.read(actionRecordId, window);
    if (!metrics) return; // cannot evaluate yet — do not emit a verdict

    this.evaluated.add(actionRecordId);
    const evaluation = evaluateOutcome({
      id: this.newId(),
      action_record_id: actionRecordId,
      window,
      evaluated_at: this.now(),
      metric: metrics.metric,
      before: metrics.before,
      after: metrics.after,
      lowerIsBetter: metrics.lowerIsBetter,
      ...(metrics.neutralBand !== undefined ? { neutralBand: metrics.neutralBand } : {}),
    });

    this.bus.publish(
      makeEvent({
        event_id: this.newId(),
        type: "outcome.evaluated",
        occurred_at: this.now(),
        client_id: e.client_id,
        correlation_id: e.correlation_id,
        causation_id: e.event_id,
        actor: { kind: "system", id: "outcome-evaluator" },
        payload: evaluation as unknown as Record<string, unknown>,
      }),
    );
  }
}

export interface LearningSnapshot {
  sample_size: number;
  result_counts: { improved: number; neutral: number; regressed: number; inconclusive: number };
  mean_causal_confidence: number;
}

/**
 * Aggregates `outcome.evaluated` into a running `learning.updated` snapshot. This
 * is a calibration *suggestion* (result mix + mean causal confidence), reviewed
 * before it changes any rule or weight — the loop never tunes itself automatically.
 */
export class LearningAggregator {
  private readonly seen = new Set<string>();
  private readonly counts: LearningSnapshot["result_counts"] = {
    improved: 0,
    neutral: 0,
    regressed: 0,
    inconclusive: 0,
  };
  private causalSum = 0;
  private n = 0;

  constructor(
    private readonly bus: InMemoryEventBus,
    private readonly newId: () => string,
    private readonly now: () => string,
  ) {}

  register(): Subscription {
    return this.bus.subscribe("outcome.evaluated", (e) => this.onEvaluated(e), "learning-aggregator");
  }

  snapshot(): LearningSnapshot {
    return {
      sample_size: this.n,
      result_counts: { ...this.counts },
      mean_causal_confidence: this.n > 0 ? this.causalSum / this.n : 0,
    };
  }

  private onEvaluated(e: EventEnvelope): void {
    const evalId = asString(e.payload.id) ?? e.event_id;
    if (this.seen.has(evalId)) return;
    this.seen.add(evalId);

    const result = asString(e.payload.result);
    if (result && result in this.counts) {
      this.counts[result as keyof LearningSnapshot["result_counts"]] += 1;
    }
    this.causalSum += Number(e.payload.causal_confidence ?? 0);
    this.n += 1;

    this.bus.publish(
      makeEvent({
        event_id: this.newId(),
        type: "learning.updated",
        occurred_at: this.now(),
        client_id: e.client_id,
        correlation_id: e.correlation_id,
        causation_id: e.event_id,
        actor: { kind: "system", id: "learning-aggregator" },
        payload: this.snapshot() as unknown as Record<string, unknown>,
      }),
    );
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
