import { z } from "zod";
import {
  Authz,
  EntityRef,
  Uuid,
  Money,
  BudgetChange,
  PolicyEvaluation,
  type OptimizationPolicy,
  type ProposedChange,
  type PolicyContext,
} from "@rtnads/contracts";
import type { PolicyEngine } from "@rtnads/policy-engine";

/**
 * Ads Actions MCP tools (docs/04 §2.4, docs/05 §D). Preview tools are PURE. Write
 * tools only REQUEST a change: they build a ProposedChange, route it through the
 * deterministic Policy Engine, and return a status — they never execute. The
 * invariant: a write tool's status is one of rejected_by_policy | pending_approval
 * | queued, never "executed" (execution is the Control plane's job).
 */

export class AuthzError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthzError";
  }
}
function requireCapability(authz: z.infer<typeof Authz>, cap: string): void {
  if (!authz.capabilities.includes(cap)) throw new AuthzError(`missing capability: ${cap}`);
}

export interface ActionsToolContext {
  policyEngine: PolicyEngine;
  getPolicy(clientId: string): Promise<OptimizationPolicy | null>;
  getContext(clientId: string, change: ProposedChange): Promise<PolicyContext>;
  newId: () => string;
}

export interface ActionToolDef<I extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  name: string;
  title: string;
  description: string;
  /** ads.read for previews, ads.action.request for writes. */
  capability: string;
  inputSchema: I;
  outputSchema: O;
  handle(ctx: ActionsToolContext, input: z.infer<I>): Promise<z.infer<O>>;
}

/** Map a policy decision to an action request status. Never "executed". */
function statusFor(decision: string): "rejected_by_policy" | "pending_approval" | "queued" {
  if (decision === "deny") return "rejected_by_policy";
  if (decision === "needs_approval") return "pending_approval";
  return "queued";
}

const WriteResult = z.object({
  status: z.enum(["rejected_by_policy", "pending_approval", "queued"]),
  action_id: Uuid.nullable(),
  policy_evaluation: PolicyEvaluation,
});

async function gate(
  ctx: ActionsToolContext,
  clientId: string,
  change: ProposedChange,
): Promise<z.infer<typeof WriteResult>> {
  const policy = await ctx.getPolicy(clientId);
  const pctx = await ctx.getContext(clientId, change);
  const policy_evaluation = ctx.policyEngine.evaluate(policy, change, pctx);
  const status = statusFor(policy_evaluation.decision);
  return {
    status,
    action_id: status === "rejected_by_policy" ? null : ctx.newId(),
    policy_evaluation,
  };
}

// ── preview_budget_change (PURE) ────────────────────────────────────────────
const PreviewBudgetInput = z.object({
  authz: Authz,
  entity: EntityRef,
  account_id: Uuid,
  change: BudgetChange,
});
const PreviewBudgetOutput = z.object({
  current_budget: Money.nullable(),
  proposed_budget: Money.nullable(),
  delta_percent: z.number(),
  policy_preview: PolicyEvaluation,
  note: z.string(),
});

export const previewBudgetChange: ActionToolDef<typeof PreviewBudgetInput, typeof PreviewBudgetOutput> = {
  name: "preview_budget_change",
  title: "Preview a budget change",
  description: "Pure preview: current vs proposed budget and the policy verdict, with no side effects.",
  capability: "ads.read",
  inputSchema: PreviewBudgetInput,
  outputSchema: PreviewBudgetOutput,
  async handle(ctx, input) {
    requireCapability(input.authz, "ads.read");
    const change: ProposedChange = {
      action_type: "update_budget",
      entity: input.entity,
      account_id: input.account_id,
      budget_change: input.change,
    };
    const policy = await ctx.getPolicy(input.authz.client_id);
    const pctx = await ctx.getContext(input.authz.client_id, change);
    const current = pctx.current_budget_minor;
    const currency = input.change.currency ?? "GBP";
    let proposed: number | null = null;
    let deltaPercent = 0;
    if (current != null) {
      if (input.change.type === "percent") {
        proposed = Math.round(current * (1 + input.change.value));
        deltaPercent = input.change.value;
      } else {
        proposed = Math.round(input.change.value);
        deltaPercent = current > 0 ? (proposed - current) / current : 0;
      }
    }
    return {
      current_budget: current == null ? null : { amount_minor: current, currency },
      proposed_budget: proposed == null ? null : { amount_minor: proposed, currency },
      delta_percent: deltaPercent,
      policy_preview: ctx.policyEngine.evaluate(policy, change, pctx),
      note: "Deterministic preview only — not a promise of outcome.",
    };
  },
};

// ── update_budget (WRITE → gated) ───────────────────────────────────────────
const UpdateBudgetInput = z.object({
  authz: Authz,
  entity: EntityRef,
  account_id: Uuid,
  change: BudgetChange,
  recommendation_id: Uuid.optional(),
  idempotency_key: z.string().optional(),
});

export const updateBudget: ActionToolDef<typeof UpdateBudgetInput, typeof WriteResult> = {
  name: "update_budget",
  title: "Update budget (gated)",
  description: "Request a budget change. Routes through the Policy Engine; never executes directly.",
  capability: "ads.action.request",
  inputSchema: UpdateBudgetInput,
  outputSchema: WriteResult,
  async handle(ctx, input) {
    requireCapability(input.authz, "ads.action.request");
    return gate(ctx, input.authz.client_id, {
      action_type: "update_budget",
      entity: input.entity,
      account_id: input.account_id,
      budget_change: input.change,
    });
  },
};

// ── pause_adset (WRITE → gated) ─────────────────────────────────────────────
const PauseInput = z.object({
  authz: Authz,
  entity: EntityRef,
  account_id: Uuid,
  reason: z.string().optional(),
  recommendation_id: Uuid.optional(),
  idempotency_key: z.string().optional(),
});

export const pauseAdset: ActionToolDef<typeof PauseInput, typeof WriteResult> = {
  name: "pause_adset",
  title: "Pause ad set (gated)",
  description: "Request pausing an ad set. Routes through the Policy Engine; never executes directly.",
  capability: "ads.action.request",
  inputSchema: PauseInput,
  outputSchema: WriteResult,
  async handle(ctx, input) {
    requireCapability(input.authz, "ads.action.request");
    return gate(ctx, input.authz.client_id, {
      action_type: "pause_adset",
      entity: input.entity,
      account_id: input.account_id,
    });
  },
};

export const ADS_ACTIONS_TOOLS = [previewBudgetChange, updateBudget, pauseAdset] as const;
