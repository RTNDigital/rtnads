import { ActionRecord, type Action } from "@rtnads/contracts";
import type { AuditSink } from "./audit.js";

/**
 * Action Executor (L6). The ONLY component that performs a platform mutation, and
 * only for an action that passed the Policy Engine AND (where required) human
 * approval (docs/07 §Action Executor, docs/11 §8). It captures immutable pre/post
 * state, writes an audit entry, and supports rollback where the platform permits.
 */

export class ExecutionRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionRefused";
  }
}

/** The platform mutation port — the real connector in prod, a mock in tests. */
export interface PlatformConnector {
  applyMutation(action: Action): Promise<{
    platform_response: Record<string, unknown>;
    post_state: Record<string, unknown>;
  }>;
  revert(record: ActionRecord): Promise<{ platform_response: Record<string, unknown> }>;
}

export interface ExecutorDeps {
  connector: PlatformConnector;
  /** Fresh read of the entity's pre-mutation state (immutable snapshot). */
  capturePreState(action: Action): Promise<Record<string, unknown>>;
  now: () => string;
  newId: () => string;
  auditLog?: AuditSink;
}

export class ActionExecutor {
  constructor(private readonly deps: ExecutorDeps) {}

  /** Precondition check: never execute a denied or unapproved action. */
  private assertExecutable(action: Action): void {
    const decision = action.policy_evaluation.decision;
    if (decision === "deny") {
      throw new ExecutionRefused("policy denied this action");
    }
    if (decision === "needs_approval" && action.status !== "approved") {
      throw new ExecutionRefused("action requires approval and is not approved");
    }
  }

  async execute(action: Action): Promise<ActionRecord> {
    this.assertExecutable(action);

    const pre_state = await this.deps.capturePreState(action);
    const { platform_response, post_state } = await this.deps.connector.applyMutation(action);

    const record = ActionRecord.parse({
      id: this.deps.newId(),
      action_id: action.id,
      pre_state,
      executed_change: action.requested_change,
      post_state,
      executed_at: this.deps.now(),
      executed_by: "system",
      platform_response,
    });

    await this.deps.auditLog?.append({
      client_id: action.client_id,
      actor: "system:action-executor",
      actor_kind: "system",
      action: "action.executed",
      subject_ref: `action:${action.id}`,
      payload: { action_type: action.action_type, record_id: record.id },
      created_at: record.executed_at,
    });

    // The record is immutable once written.
    return Object.freeze(record);
  }

  /** Roll back a prior execution where the platform permits it. */
  async rollback(record: ActionRecord, action: Action): Promise<ActionRecord> {
    const { platform_response } = await this.deps.connector.revert(record);

    const reverted = ActionRecord.parse({
      id: this.deps.newId(),
      action_id: record.action_id,
      pre_state: record.post_state ?? {},
      executed_change: { rollback_of: record.id },
      post_state: record.pre_state, // restored to the original state
      executed_at: this.deps.now(),
      executed_by: "system",
      platform_response,
      rollback_ref: record.id,
    });

    await this.deps.auditLog?.append({
      client_id: action.client_id,
      actor: "system:action-executor",
      actor_kind: "system",
      action: "action.rolled_back",
      subject_ref: `action:${record.action_id}`,
      payload: { rolled_back_record: record.id, new_record: reverted.id },
      created_at: reverted.executed_at,
    });

    return Object.freeze(reverted);
  }
}
