import type { Pool } from "pg";
import {
  Recommendation,
  type Action,
  type ActionRecord,
  type AuditEntry,
  type ActionType,
  type LearningSuggestion,
} from "@rtnads/contracts";
import { PgAuditLog } from "@rtnads/action-executor";
import { PgLearningSuggestionStore } from "@rtnads/knowledge-service";
import type { QueryStore, ControlOps, LearningStore, LearningDecision, Principal, RecommendationFilter } from "./types.js";

/**
 * Postgres-backed Query + Control stores for the BFF (docs/06). Reads persisted
 * recommendations from intel.*, and writes approvals/actions + an audit entry to
 * control.*. Every access is scoped by client_id (and sets app.client_id for RLS
 * defense in depth); another tenant's rows are invisible.
 */

function mapActionType(recType: string): ActionType {
  if (recType === "pause_adset") return "pause_adset";
  if (recType === "pause_campaign") return "pause_campaign";
  if (recType === "pause_ad") return "pause_ad";
  if (recType === "activate") return "activate_campaign";
  return "update_budget"; // reallocate / budget_increase / budget_decrease
}

export class PgQueryStore implements QueryStore {
  constructor(private readonly pool: Pool) {}

  private async scoped<T>(clientId: string, fn: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("SELECT set_config('app.client_id', $1, true)", [clientId]);
      return await fn(c);
    } finally {
      c.release();
    }
  }

  async listRecommendations(clientId: string, filter: RecommendationFilter): Promise<Recommendation[]> {
    return this.scoped(clientId, async (c) => {
      const { rows } = await c.query(
        `SELECT doc FROM intel.recommendation
          WHERE client_id=$1 AND ($2::text IS NULL OR status=$2)
          ORDER BY created_at DESC`,
        [clientId, filter.status ?? null],
      );
      return rows.map((r) => Recommendation.parse(r.doc));
    });
  }

  async getRecommendation(clientId: string, id: string): Promise<Recommendation | null> {
    return this.scoped(clientId, async (c) => {
      const { rows } = await c.query(
        "SELECT doc FROM intel.recommendation WHERE client_id=$1 AND id=$2",
        [clientId, id],
      );
      return rows[0] ? Recommendation.parse(rows[0].doc) : null;
    });
  }

  async getAction(clientId: string, id: string): Promise<{ action: Action; record: ActionRecord | null } | null> {
    return this.scoped(clientId, async (c) => {
      const { rows } = await c.query("SELECT * FROM control.action WHERE client_id=$1 AND id=$2", [clientId, id]);
      if (!rows[0]) return null;
      const a = rows[0];
      const action: Action = {
        id: a.id, client_id: a.client_id, recommendation_id: a.recommendation_id, approval_id: a.approval_id,
        entity: { type: a.entity_type, id: a.entity_id }, account_id: a.account_id, action_type: a.action_type,
        requested_change: a.requested_change, policy_evaluation: a.policy_evaluation, status: a.status,
        created_at: new Date(a.created_at).toISOString(),
      };
      const rec = await c.query("SELECT * FROM control.action_record WHERE action_id=$1 ORDER BY executed_at DESC LIMIT 1", [id]);
      const r = rec.rows[0];
      const record: ActionRecord | null = r ? {
        id: r.id, action_id: r.action_id, pre_state: r.pre_state, executed_change: r.executed_change,
        post_state: r.post_state, executed_at: new Date(r.executed_at).toISOString(), executed_by: r.executed_by,
        platform_response: r.platform_response, rollback_ref: r.rollback_ref, evaluation_window: r.evaluation_window, result: r.result,
      } : null;
      return { action, record };
    });
  }

  async getAudit(clientId: string, subjectRef: string): Promise<AuditEntry[]> {
    return this.scoped(clientId, async (c) => {
      const { rows } = await c.query(
        `SELECT seq, client_id, actor, actor_kind, action, subject_ref, payload, prev_hash, hash,
                to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
           FROM control.audit_entry WHERE client_id=$1 AND subject_ref=$2 ORDER BY seq`,
        [clientId, subjectRef],
      );
      return rows.map((r) => ({ ...r, seq: Number(r.seq) })) as AuditEntry[];
    });
  }
}

export class PgControlOps implements ControlOps {
  private readonly audit: PgAuditLog;
  constructor(private readonly pool: Pool, private readonly now: () => string, private readonly newId: () => string) {
    this.audit = new PgAuditLog(pool);
  }

  async approve(clientId: string, recommendationId: string, principal: Principal, note?: string) {
    const rec = await this.loadRec(clientId, recommendationId);
    const approvalId = this.newId();
    const actionId = this.newId();
    const now = this.now();
    const actionType = mapActionType(rec.recommendation_type);
    const policyEval = { decision: "needs_approval", violated_constraints: [], requires_approval: true, policy_version: 0 };

    const c = await this.pool.connect();
    try {
      await c.query("SELECT set_config('app.client_id', $1, true)", [clientId]);
      await c.query(
        `INSERT INTO control.approval (id, client_id, recommendation_id, decided_by, decision, decided_at, note)
         VALUES ($1,$2,$3,$4,'approve',$5,$6)`,
        [approvalId, clientId, recommendationId, principal.user_id, now, note ?? null],
      );
      await c.query(
        `INSERT INTO control.action
           (id, client_id, recommendation_id, approval_id, entity_type, entity_id, account_id, action_type, requested_change, policy_evaluation, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'approved',$11)`,
        [actionId, clientId, recommendationId, approvalId, rec.entity.type, rec.entity.id,
         (rec as { account_id?: string }).account_id ?? "00000000-0000-0000-0000-000000000000",
         actionType, JSON.stringify(rec.recommended_action), JSON.stringify(policyEval), now],
      );
      await c.query("UPDATE intel.recommendation SET status='approved' WHERE id=$1 AND client_id=$2", [recommendationId, clientId]);
    } finally {
      c.release();
    }
    await this.audit.append({ client_id: clientId, actor: principal.user_id, actor_kind: "user", action: "decision.approved", subject_ref: `action:${actionId}`, payload: { recommendation_id: recommendationId }, created_at: now });

    const approval = { id: approvalId, recommendation_id: recommendationId, decided_by: principal.user_id, decision: "approve" as const, decided_at: now, ...(note ? { note } : {}) };
    const action: Action = { id: actionId, client_id: clientId, recommendation_id: recommendationId, approval_id: approvalId, entity: rec.entity, account_id: (rec as { account_id?: string }).account_id ?? "00000000-0000-0000-0000-000000000000", action_type: actionType, requested_change: rec.recommended_action, policy_evaluation: policyEval as Action["policy_evaluation"], status: "approved", created_at: now };
    return { approval, action };
  }

  async reject(clientId: string, recommendationId: string, principal: Principal, reason: string) {
    const now = this.now();
    const approvalId = this.newId();
    const c = await this.pool.connect();
    try {
      await c.query("SELECT set_config('app.client_id', $1, true)", [clientId]);
      await c.query(
        `INSERT INTO control.approval (id, client_id, recommendation_id, decided_by, decision, decided_at, note)
         VALUES ($1,$2,$3,$4,'reject',$5,$6)`,
        [approvalId, clientId, recommendationId, principal.user_id, now, reason],
      );
      await c.query("UPDATE intel.recommendation SET status='rejected' WHERE id=$1 AND client_id=$2", [recommendationId, clientId]);
    } finally {
      c.release();
    }
    await this.audit.append({ client_id: clientId, actor: principal.user_id, actor_kind: "user", action: "decision.rejected", subject_ref: `recommendation:${recommendationId}`, payload: { reason }, created_at: now });
    return { approval: { id: approvalId, recommendation_id: recommendationId, decided_by: principal.user_id, decision: "reject" as const, decided_at: now, note: reason } };
  }

  private async loadRec(clientId: string, id: string): Promise<Recommendation & { account_id?: string }> {
    const c = await this.pool.connect();
    try {
      await c.query("SELECT set_config('app.client_id', $1, true)", [clientId]);
      const { rows } = await c.query("SELECT doc, account_id FROM intel.recommendation WHERE client_id=$1 AND id=$2", [clientId, id]);
      if (!rows[0]) throw new Error("recommendation not found");
      return { ...Recommendation.parse(rows[0].doc), account_id: rows[0].account_id };
    } finally {
      c.release();
    }
  }
}

/**
 * Postgres-backed learning-suggestion store for the BFF. Reads/decides via the
 * knowledge-service store (RLS-scoped) and appends an audit entry on every human
 * decision, so accepting/rejecting a calibration is as accountable as approving an
 * action (docs/08 Flow E, docs/09 §8).
 */
export class PgBffLearningStore implements LearningStore {
  private readonly store: PgLearningSuggestionStore;
  private readonly audit: PgAuditLog;
  constructor(private readonly pool: Pool, private readonly now: () => string, newId: () => string) {
    this.store = new PgLearningSuggestionStore(pool, now, newId);
    this.audit = new PgAuditLog(pool);
  }

  listSuggestions(clientId: string, status?: string): Promise<LearningSuggestion[]> {
    return this.store.list(clientId, status as Parameters<PgLearningSuggestionStore["list"]>[1]);
  }

  async decide(clientId: string, id: string, decision: LearningDecision, principal: Principal, note?: string): Promise<LearningSuggestion> {
    const suggestion = await this.store.decide(clientId, id, decision, principal.user_id, note);
    await this.audit.append({
      client_id: clientId,
      actor: principal.user_id,
      actor_kind: "user",
      action: decision === "accepted" ? "learning.accepted" : "learning.rejected",
      subject_ref: `learning_suggestion:${id}`,
      payload: { note: note ?? null },
      created_at: this.now(),
    });
    return suggestion;
  }
}
