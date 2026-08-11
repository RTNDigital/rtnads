import type { Action, ActionRecord } from "./control.js";

/**
 * The platform write-path port (docs/07 §Connectors, docs/11 §8). The single seam
 * between the L6 Action Executor and an L1 connector's mutation path.
 *
 * It lives in contracts (a leaf) ON PURPOSE: the dependency-boundary guard forbids
 * an L1 connector from importing the L6 executor, so the shared shape cannot live
 * in either service. Both sides depend only on this contract — the executor
 * consumes a `PlatformWriteConnector`, a connector `implements` one.
 *
 * Invariants the executor relies on:
 *  - `applyMutation` is called ONLY for an action that passed the Policy Engine
 *    and (where required) human approval — the executor enforces this before
 *    calling; the connector never re-decides policy.
 *  - `applyMutation` is IDEMPOTENT: a connector resolves any relative change
 *    (e.g. a percentage) to an ABSOLUTE target before writing, so a retried apply
 *    converges to the same platform state instead of compounding.
 *  - `revert` restores the immutable `pre_state` captured on the record; `action`
 *    carries the entity/account addressing needed to locate the platform target.
 */

export interface MutationResult {
  /** The raw platform acknowledgement, recorded verbatim on the action_record. */
  platform_response: Record<string, unknown>;
  /** The entity state observed immediately after the mutation. */
  post_state: Record<string, unknown>;
}

export interface RevertResult {
  platform_response: Record<string, unknown>;
}

export interface PlatformWriteConnector {
  applyMutation(action: Action): Promise<MutationResult>;
  revert(record: ActionRecord, action: Action): Promise<RevertResult>;
}
