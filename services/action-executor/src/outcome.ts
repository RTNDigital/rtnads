import type { OutcomeEvaluation, ActionResult } from "@rtnads/contracts";

/**
 * Deterministic outcome evaluation (docs/11 §9). Compares a metric before vs
 * after the observation window and classifies the result. `causal_confidence` is
 * deliberately CONSERVATIVE and capped: a single before/after comparison cannot
 * establish that the action *caused* the change (seasonality, auction dynamics,
 * etc.), so this never claims strong causation — evidence, not proof (docs/00 §3).
 */

export interface OutcomeInput {
  id: string;
  action_record_id: string;
  metric: string;
  before: number;
  after: number;
  /** True for cost metrics (lower is better); false for ROAS/revenue. */
  lowerIsBetter: boolean;
  window: Record<string, unknown>;
  evaluated_at: string;
  /** Relative change below this magnitude is treated as neutral. Default 0.05. */
  neutralBand?: number;
}

export function evaluateOutcome(inp: OutcomeInput): OutcomeEvaluation {
  const band = inp.neutralBand ?? 0.05;
  const delta = inp.after - inp.before;
  const relative = inp.before !== 0 ? delta / Math.abs(inp.before) : 0;

  let result: ActionResult;
  if (Math.abs(relative) < band) {
    result = "neutral";
  } else {
    const improvedDirection = inp.lowerIsBetter ? delta < 0 : delta > 0;
    result = improvedDirection ? "improved" : "regressed";
  }

  // Conservative causal confidence: base low, small bump for a large effect,
  // hard-capped at 0.5 — a single window never yields strong causal proof.
  let causal = 0.2;
  if (Math.abs(relative) >= 0.15) causal = 0.4;
  if (result === "neutral") causal = 0.1;
  const causal_confidence = Math.min(0.5, causal);

  return {
    id: inp.id,
    action_record_id: inp.action_record_id,
    evaluated_at: inp.evaluated_at,
    window: inp.window,
    metrics_before: { [inp.metric]: inp.before },
    metrics_after: { [inp.metric]: inp.after },
    delta: { [inp.metric]: delta, relative },
    result,
    causal_confidence,
  };
}
