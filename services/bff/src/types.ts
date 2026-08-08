import type {
  Role,
  Capability,
  Recommendation,
  Action,
  ActionRecord,
  Approval,
  AuditEntry,
} from "@rtnads/contracts";

/**
 * BFF principal + ports (docs/06). The principal is derived from the session, and
 * its `client_id` is the ONLY source of tenant scope — never a request body
 * (docs/06 §5, docs/09 §4). Every store call is scoped by principal.client_id.
 */
export interface Principal {
  user_id: string;
  client_id: string;
  roles: Role[];
  capabilities: Capability[];
}

export interface RecommendationFilter {
  status?: string;
}

/** Read models for the operator UI. */
export interface QueryStore {
  listRecommendations(clientId: string, filter: RecommendationFilter): Promise<Recommendation[]>;
  getRecommendation(clientId: string, id: string): Promise<Recommendation | null>;
  getAction(clientId: string, id: string): Promise<{ action: Action; record: ActionRecord | null } | null>;
  getAudit(clientId: string, subjectRef: string): Promise<AuditEntry[]>;
}

/** Control operations invoked by the approval workflow. */
export interface ControlOps {
  approve(clientId: string, recommendationId: string, principal: Principal, note?: string): Promise<{ approval: Approval; action: Action }>;
  reject(clientId: string, recommendationId: string, principal: Principal, reason: string): Promise<{ approval: Approval }>;
}

export interface BffDeps {
  query: QueryStore;
  control: ControlOps;
}

export interface HttpRequest {
  method: string;
  path: string;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}
