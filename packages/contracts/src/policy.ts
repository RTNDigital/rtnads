import { z } from "zod";
import { Uuid, EntityRef, Money } from "./common.js";

/**
 * Policy / action contracts (docs/10, docs/11 §8). The Policy Engine is the
 * deterministic, unbypassable gate between the AI and any platform mutation. The
 * AI can PROPOSE a change; only a passing PolicyEvaluation (plus human approval
 * where required) lets it execute.
 */

export const ActionType = z.enum([
  "update_budget",
  "pause_ad",
  "pause_adset",
  "pause_campaign",
  "activate_ad",
  "activate_adset",
  "activate_campaign",
  "create_experiment",
]);
export type ActionType = z.infer<typeof ActionType>;

/** Coarse action category used for automation tiers and cooldowns. */
export const ActionCategory = z.enum(["budget_change", "pause", "activate", "experiment"]);
export type ActionCategory = z.infer<typeof ActionCategory>;

export function categoryOf(action: ActionType): ActionCategory {
  if (action === "update_budget") return "budget_change";
  if (action.startsWith("pause")) return "pause";
  if (action.startsWith("activate")) return "activate";
  return "experiment";
}

export const BudgetChange = z.object({
  type: z.enum(["percent", "absolute"]),
  /** For percent: fraction (0.2 = +20%). For absolute: target budget in minor units. */
  value: z.number(),
  currency: z.string().length(3).optional(),
});
export type BudgetChange = z.infer<typeof BudgetChange>;

export const ProposedChange = z.object({
  action_type: ActionType,
  entity: EntityRef,
  account_id: Uuid,
  budget_change: BudgetChange.optional(),
});
export type ProposedChange = z.infer<typeof ProposedChange>;

export const CampaignState = z.enum(["learning", "stabilizing", "mature"]);
export type CampaignState = z.infer<typeof CampaignState>;

/** Deterministic facts about the entity used to evaluate policy. */
export const PolicyContext = z.object({
  current_budget_minor: z.number().int().nonnegative().nullable().default(null),
  campaign_maturity: CampaignState.nullable().default(null),
  evidence_days: z.number().nonnegative(),
  conversions: z.number().nonnegative(),
  spend_minor: z.number().int().nonnegative(),
  hours_since_last_change: z.number().nonnegative().nullable().default(null),
  daily_spend_minor: z.number().int().nonnegative().default(0),
  active_experiment: z.boolean().default(false),
});
export type PolicyContext = z.infer<typeof PolicyContext>;

export const AutomationTier = z.enum(["disabled", "requires_approval", "auto"]);
export type AutomationTier = z.infer<typeof AutomationTier>;

/** The client-scoped optimization policy (docs/10 §3). */
export const OptimizationPolicy = z.object({
  version: z.number().int().positive(),
  client_id: Uuid,
  constraints: z.object({
    budget_change: z.object({ max_percent: z.number(), max_absolute: Money }),
    evidence: z.object({
      min_days: z.number(),
      min_conversions: z.number(),
      min_spend: Money,
    }),
    cooldown: z.object({ budget_change_hours: z.number(), pause_hours: z.number() }),
    maturity: z.object({ min_campaign_state: CampaignState }),
    automation: z.record(ActionCategory, AutomationTier),
    account_restrictions: z.object({
      protected_accounts: z.array(Uuid),
      excluded_actions: z.array(ActionType),
    }),
    experiment_protection: z.boolean(),
    daily_spend_limit: Money,
  }),
});
export type OptimizationPolicy = z.infer<typeof OptimizationPolicy>;

export const PolicyDecision = z.enum(["allow", "needs_approval", "deny"]);
export type PolicyDecision = z.infer<typeof PolicyDecision>;

export const ViolatedConstraint = z.object({
  code: z.string(),
  detail: z.string(),
  /** deny = hard block; needs_approval = requires human sign-off. */
  level: z.enum(["deny", "needs_approval"]),
});
export type ViolatedConstraint = z.infer<typeof ViolatedConstraint>;

export const PolicyEvaluation = z.object({
  decision: PolicyDecision,
  violated_constraints: z.array(ViolatedConstraint),
  requires_approval: z.boolean(),
  policy_version: z.number().int(),
});
export type PolicyEvaluation = z.infer<typeof PolicyEvaluation>;
