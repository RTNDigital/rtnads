import { z } from "zod";
import { Uuid } from "./common.js";

/**
 * Strategy Memory learning suggestions (docs/08 Flow E, docs/11 §9). The learning
 * loop never tunes itself: an `outcome.evaluated` roll-up becomes a PENDING
 * suggestion here, and only a human decision (accept/reject) can act on it. This is
 * the durable, auditable record of that human-in-the-loop gate.
 */

export const LearningSuggestionStatus = z.enum(["pending", "accepted", "rejected", "superseded"]);
export type LearningSuggestionStatus = z.infer<typeof LearningSuggestionStatus>;

export const LearningSuggestion = z.object({
  id: Uuid,
  client_id: Uuid,
  created_at: z.string().datetime(),
  status: LearningSuggestionStatus.default("pending"),
  /** What sort of suggestion this is, e.g. "calibration". */
  kind: z.string(),
  /** The learning.updated snapshot that produced it (result mix, mean causal conf, …). */
  snapshot: z.record(z.string(), z.unknown()),
  /** The event that produced it (dedupe / provenance). */
  source_event_id: Uuid.nullable().default(null),
  note: z.string().nullable().default(null),
  decided_by: z.string().nullable().default(null),
  decided_at: z.string().datetime().nullable().default(null),
});
export type LearningSuggestion = z.infer<typeof LearningSuggestion>;
