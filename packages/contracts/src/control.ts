import { z } from "zod";
import { Uuid, EntityRef } from "./common.js";
import { ActionType, PolicyEvaluation } from "./policy.js";
import { ActorKind } from "./events.js";

/**
 * Control-plane contracts (docs/02 §9, docs/03 §control, docs/08 §D–E). Every
 * executed action produces an IMMUTABLE record; the audit log is append-only and
 * hash-chained. These are the Decision Memory + accountability substrate.
 */

export const ApprovalDecision = z.enum(["approve", "reject"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

export const Approval = z.object({
  id: Uuid,
  recommendation_id: Uuid.nullable().default(null),
  decided_by: z.string(), // principal
  decision: ApprovalDecision,
  decided_at: z.string().datetime(),
  note: z.string().optional(),
});
export type Approval = z.infer<typeof Approval>;

export const ActionStatus = z.enum([
  "pending_approval",
  "approved",
  "rejected",
  "queued",
  "executed",
  "rolled_back",
  "failed",
]);
export type ActionStatus = z.infer<typeof ActionStatus>;

export const Action = z.object({
  id: Uuid,
  client_id: Uuid,
  recommendation_id: Uuid.nullable().default(null),
  approval_id: Uuid.nullable().default(null),
  entity: EntityRef,
  account_id: Uuid,
  action_type: ActionType,
  requested_change: z.record(z.string(), z.unknown()),
  policy_evaluation: PolicyEvaluation,
  status: ActionStatus,
  created_at: z.string().datetime(),
});
export type Action = z.infer<typeof Action>;

export const ActionResult = z.enum(["improved", "neutral", "regressed", "inconclusive"]);
export type ActionResult = z.infer<typeof ActionResult>;

/** Immutable record of an executed action (pre/post state captured). */
export const ActionRecord = z.object({
  id: Uuid,
  action_id: Uuid,
  pre_state: z.record(z.string(), z.unknown()),
  executed_change: z.record(z.string(), z.unknown()),
  post_state: z.record(z.string(), z.unknown()).nullable().default(null),
  executed_at: z.string().datetime(),
  executed_by: z.string(), // system | user principal
  platform_response: z.record(z.string(), z.unknown()).nullable().default(null),
  rollback_ref: Uuid.nullable().default(null),
  evaluation_window: z.record(z.string(), z.unknown()).nullable().default(null),
  result: ActionResult.nullable().default(null),
});
export type ActionRecord = z.infer<typeof ActionRecord>;

export const OutcomeEvaluation = z.object({
  id: Uuid,
  action_record_id: Uuid,
  evaluated_at: z.string().datetime(),
  window: z.record(z.string(), z.unknown()),
  metrics_before: z.record(z.string(), z.unknown()),
  metrics_after: z.record(z.string(), z.unknown()),
  delta: z.record(z.string(), z.unknown()),
  result: ActionResult,
  /** Deliberately conservative — a metric can move for reasons unrelated to the action. */
  causal_confidence: z.number().min(0).max(1),
});
export type OutcomeEvaluation = z.infer<typeof OutcomeEvaluation>;

/** One link in the append-only, hash-chained audit log. */
export const AuditEntry = z.object({
  seq: z.number().int().nonnegative(),
  client_id: Uuid.nullable(),
  actor: z.string(),
  actor_kind: ActorKind,
  action: z.string(),
  subject_ref: z.string(),
  payload: z.record(z.string(), z.unknown()),
  prev_hash: z.string(),
  hash: z.string(),
  created_at: z.string().datetime(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
