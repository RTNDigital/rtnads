import { EventEnvelope, type ActorKind } from "@rtnads/contracts";

/**
 * Factory for a durable event envelope (docs/08 §1). Callers supply identity,
 * tenancy, the causation link and the type-specific payload; `schema_version`
 * defaults to 1. The result is validated against the contract so a malformed
 * event can never reach the bus.
 */
export interface MakeEventInput {
  event_id: string;
  type: string;
  occurred_at: string;
  client_id: string;
  correlation_id: string;
  causation_id: string | null;
  actor: { kind: ActorKind; id: string };
  payload: Record<string, unknown>;
  schema_version?: number;
}

export function makeEvent(input: MakeEventInput): EventEnvelope {
  return EventEnvelope.parse({
    schema_version: 1,
    ...input,
  });
}
