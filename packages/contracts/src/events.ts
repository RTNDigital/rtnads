import { z } from "zod";
import { Uuid } from "./common.js";

/**
 * Durable event envelope (docs/08-event-flow.md §1). Events are ordered per
 * aggregate, carry client_id for tenancy and correlation_id for tracing.
 */

export const ActorKind = z.enum(["system", "user", "llm"]);
export type ActorKind = z.infer<typeof ActorKind>;

export const EventEnvelope = z.object({
  event_id: Uuid,
  type: z.string(), // e.g. "ingest.sync.completed"
  occurred_at: z.string().datetime(),
  client_id: Uuid,
  correlation_id: Uuid, // ties a whole workflow together
  causation_id: Uuid.nullable(), // the event that caused this one
  actor: z.object({ kind: ActorKind, id: z.string() }),
  payload: z.record(z.string(), z.unknown()),
  schema_version: z.number().int().positive().default(1),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

/** Known event type prefixes (families). Kept as a const for discoverability. */
export const EVENT_FAMILIES = [
  "ingest",
  "warehouse",
  "intel",
  "decision",
  "action",
  "outcome",
  "audit",
] as const;
export type EventFamily = (typeof EVENT_FAMILIES)[number];
