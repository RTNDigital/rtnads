import type { Pool } from "pg";
import type { Action, ActionRecord, Approval } from "@rtnads/contracts";

/**
 * Postgres persistence for the control plane (docs/03 §control). Persists
 * approvals, actions and IMMUTABLE action records. Tenancy is enforced by RLS +
 * an explicit client_id column; the audit chain is written via PgAuditLog.
 */
export class PgControlStore {
  constructor(private readonly pool: Pool) {}

  async insertApproval(clientId: string, a: Approval): Promise<void> {
    await this.pool.query(
      `INSERT INTO control.approval (id, client_id, recommendation_id, decided_by, decision, decided_at, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [a.id, clientId, a.recommendation_id, a.decided_by, a.decision, a.decided_at, a.note ?? null],
    );
  }

  async insertAction(a: Action): Promise<void> {
    await this.pool.query(
      `INSERT INTO control.action
         (id, client_id, recommendation_id, approval_id, entity_type, entity_id, account_id, action_type, requested_change, policy_evaluation, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)`,
      [
        a.id, a.client_id, a.recommendation_id, a.approval_id,
        a.entity.type, a.entity.id, a.account_id, a.action_type,
        JSON.stringify(a.requested_change), JSON.stringify(a.policy_evaluation),
        a.status, a.created_at,
      ],
    );
  }

  async updateActionStatus(id: string, status: string): Promise<void> {
    await this.pool.query("UPDATE control.action SET status=$2 WHERE id=$1", [id, status]);
  }

  async insertActionRecord(clientId: string, r: ActionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO control.action_record
         (id, client_id, action_id, pre_state, executed_change, post_state, executed_at, executed_by, platform_response, rollback_ref, evaluation_window, result)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9::jsonb,$10,$11::jsonb,$12)`,
      [
        r.id, clientId, r.action_id,
        JSON.stringify(r.pre_state), JSON.stringify(r.executed_change),
        r.post_state == null ? null : JSON.stringify(r.post_state),
        r.executed_at, r.executed_by,
        r.platform_response == null ? null : JSON.stringify(r.platform_response),
        r.rollback_ref,
        r.evaluation_window == null ? null : JSON.stringify(r.evaluation_window),
        r.result,
      ],
    );
  }

  async countActionRecords(actionId: string): Promise<number> {
    const { rows } = await this.pool.query(
      "SELECT count(*)::int AS n FROM control.action_record WHERE action_id=$1",
      [actionId],
    );
    return rows[0].n;
  }
}
