import type {
  Recommendation,
  Action,
  ActionRecord,
  Approval,
  AuditEntry,
  LearningSuggestion,
} from "@rtnads/contracts";
import type { QueryStore, ControlOps, LearningStore, LearningDecision, Principal, RecommendationFilter } from "./types.js";

/**
 * In-memory Query + Control stores for tests. All reads are scoped by client_id;
 * a resource belonging to another client is simply invisible (returns null / []),
 * so cross-tenant existence never leaks.
 */

interface Seed {
  recommendations?: Record<string, Recommendation[]>; // by client_id
  actions?: Record<string, { action: Action; record: ActionRecord | null }[]>;
  audit?: Record<string, AuditEntry[]>; // by client_id
}

export class InMemoryQueryStore implements QueryStore {
  constructor(private readonly seed: Seed = {}) {}

  async listRecommendations(clientId: string, filter: RecommendationFilter): Promise<Recommendation[]> {
    const all = this.seed.recommendations?.[clientId] ?? [];
    return filter.status ? all.filter((r) => r.status === filter.status) : all;
  }
  async getRecommendation(clientId: string, id: string): Promise<Recommendation | null> {
    return (this.seed.recommendations?.[clientId] ?? []).find((r) => r.id === id) ?? null;
  }
  async getAction(clientId: string, id: string): Promise<{ action: Action; record: ActionRecord | null } | null> {
    return (this.seed.actions?.[clientId] ?? []).find((a) => a.action.id === id) ?? null;
  }
  async getAudit(clientId: string, subjectRef: string): Promise<AuditEntry[]> {
    return (this.seed.audit?.[clientId] ?? []).filter((e) => e.subject_ref === subjectRef);
  }
}

export class InMemoryControlOps implements ControlOps {
  public readonly approvals: Approval[] = [];
  public readonly actions: Action[] = [];
  constructor(private readonly now: () => string, private readonly newId: () => string) {}

  async approve(clientId: string, recommendationId: string, principal: Principal, note?: string) {
    const approval: Approval = {
      id: this.newId(),
      recommendation_id: recommendationId,
      decided_by: principal.user_id,
      decision: "approve",
      decided_at: this.now(),
      ...(note ? { note } : {}),
    };
    const action: Action = {
      id: this.newId(),
      client_id: clientId,
      recommendation_id: recommendationId,
      approval_id: approval.id,
      entity: { type: "campaign", id: "00000000-0000-0000-0000-000000000000" },
      account_id: "00000000-0000-0000-0000-000000000000",
      action_type: "update_budget",
      requested_change: {},
      policy_evaluation: { decision: "needs_approval", violated_constraints: [], requires_approval: true, policy_version: 1 },
      status: "approved",
      created_at: this.now(),
    };
    this.approvals.push(approval);
    this.actions.push(action);
    return { approval, action };
  }

  async reject(clientId: string, recommendationId: string, principal: Principal, reason: string) {
    const approval: Approval = {
      id: this.newId(),
      recommendation_id: recommendationId,
      decided_by: principal.user_id,
      decision: "reject",
      decided_at: this.now(),
      note: reason,
    };
    this.approvals.push(approval);
    return { approval };
  }
}

/** In-memory learning-suggestion store for tests. Seeded per client; decide mutates. */
export class InMemoryLearningStore implements LearningStore {
  constructor(
    private readonly seed: Record<string, LearningSuggestion[]> = {},
    private readonly now: () => string = () => "2026-08-22T00:00:00.000Z",
  ) {}

  async listSuggestions(clientId: string, status = "pending"): Promise<LearningSuggestion[]> {
    const all = this.seed[clientId] ?? [];
    return status ? all.filter((s) => s.status === status) : all;
  }

  async decide(clientId: string, id: string, decision: LearningDecision, principal: Principal, note?: string): Promise<LearningSuggestion> {
    const s = (this.seed[clientId] ?? []).find((x) => x.id === id);
    if (!s) throw new Error("learning suggestion not found");
    if (s.status !== "pending") throw new Error(`cannot decide a ${s.status} suggestion`);
    s.status = decision;
    s.decided_by = principal.user_id;
    s.decided_at = this.now();
    if (note !== undefined) s.note = note;
    return s;
  }
}
