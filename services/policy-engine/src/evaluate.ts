import {
  categoryOf,
  type OptimizationPolicy,
  type ProposedChange,
  type PolicyContext,
  type PolicyEvaluation,
  type ViolatedConstraint,
  type CampaignState,
} from "@rtnads/contracts";

/**
 * The deterministic Policy Engine (docs/10, docs/11 §8). Given a proposed change,
 * the entity's context and the client's policy, it returns allow | needs_approval
 * | deny with the exact violated constraints. It is the SOLE allow/deny authority
 * and the AI cannot bypass it. Pure and reproducible — same inputs, same verdict.
 *
 * Precedence: any deny-level violation → deny; else any needs_approval →
 * needs_approval; else allow. Fails closed (see evaluatePolicy on a missing policy).
 */

const MATURITY_ORDER: Record<CampaignState, number> = {
  learning: 0,
  stabilizing: 1,
  mature: 2,
};

function deny(code: string, detail: string): ViolatedConstraint {
  return { code, detail, level: "deny" };
}
function needsApproval(code: string, detail: string): ViolatedConstraint {
  return { code, detail, level: "needs_approval" };
}

/** Absolute delta (minor units) and fractional delta of a budget change. */
function budgetDeltas(
  change: ProposedChange,
  ctx: PolicyContext,
): { deltaAbsMinor: number; deltaFraction: number; increase: boolean } {
  const current = ctx.current_budget_minor ?? 0;
  const bc = change.budget_change;
  if (!bc) return { deltaAbsMinor: 0, deltaFraction: 0, increase: false };
  if (bc.type === "percent") {
    const deltaAbsMinor = Math.round(Math.abs(current * bc.value));
    return { deltaAbsMinor, deltaFraction: Math.abs(bc.value), increase: bc.value > 0 };
  }
  // absolute: value is the target budget in minor units
  const deltaAbsMinor = Math.abs(bc.value - current);
  const deltaFraction = current > 0 ? deltaAbsMinor / current : Infinity;
  return { deltaAbsMinor, deltaFraction, increase: bc.value > current };
}

export function evaluate(
  policy: OptimizationPolicy,
  change: ProposedChange,
  ctx: PolicyContext,
): PolicyEvaluation {
  const c = policy.constraints;
  const category = categoryOf(change.action_type);
  const v: ViolatedConstraint[] = [];

  // 1. Account restrictions (hard).
  if (
    c.account_restrictions.protected_accounts.includes(change.account_id) &&
    c.account_restrictions.excluded_actions.includes(change.action_type)
  ) {
    v.push(deny("ACCOUNT_RESTRICTED", `action ${change.action_type} excluded on protected account`));
  }

  // 2. Active-experiment protection (hard).
  if (
    c.experiment_protection &&
    ctx.active_experiment &&
    (category === "budget_change" || category === "pause" || category === "activate")
  ) {
    v.push(deny("EXPERIMENT_PROTECTED", "an active experiment protects this entity"));
  }

  // 3. Evidence minimums (for impactful changes).
  if (category === "budget_change" || category === "pause") {
    if (ctx.evidence_days < c.evidence.min_days)
      v.push(deny("MIN_EVIDENCE_DAYS", `have ${ctx.evidence_days}d, need ${c.evidence.min_days}d`));
    if (ctx.conversions < c.evidence.min_conversions)
      v.push(deny("MIN_CONVERSIONS", `have ${ctx.conversions}, need ${c.evidence.min_conversions}`));
    if (ctx.spend_minor < c.evidence.min_spend.amount_minor)
      v.push(deny("MIN_SPEND", `have ${ctx.spend_minor}, need ${c.evidence.min_spend.amount_minor}`));
  }

  // 4. Campaign maturity (budget changes).
  if (category === "budget_change" && ctx.campaign_maturity) {
    if (MATURITY_ORDER[ctx.campaign_maturity] < MATURITY_ORDER[c.maturity.min_campaign_state])
      v.push(deny("MATURITY", `maturity ${ctx.campaign_maturity} below ${c.maturity.min_campaign_state}`));
  }

  // 5. Cooldown since last change.
  if (ctx.hours_since_last_change != null) {
    const window = category === "budget_change" ? c.cooldown.budget_change_hours : c.cooldown.pause_hours;
    if ((category === "budget_change" || category === "pause") && ctx.hours_since_last_change < window)
      v.push(deny("COOLDOWN", `${ctx.hours_since_last_change}h since last change, cooldown ${window}h`));
  }

  // 6. Budget delta limits + daily spend limit.
  if (category === "budget_change") {
    const { deltaAbsMinor, deltaFraction, increase } = budgetDeltas(change, ctx);
    if (deltaFraction > c.budget_change.max_percent)
      v.push(deny("MAX_BUDGET_DELTA_PERCENT", `Δ${deltaFraction.toFixed(3)} > ${c.budget_change.max_percent}`));
    if (deltaAbsMinor > c.budget_change.max_absolute.amount_minor)
      v.push(deny("MAX_BUDGET_DELTA_ABSOLUTE", `Δ${deltaAbsMinor} > ${c.budget_change.max_absolute.amount_minor}`));
    if (increase && ctx.daily_spend_minor + deltaAbsMinor > c.daily_spend_limit.amount_minor)
      v.push(deny("DAILY_SPEND_LIMIT", `projected ${ctx.daily_spend_minor + deltaAbsMinor} > ${c.daily_spend_limit.amount_minor}`));
  }

  // 7. Automation tier for this action category.
  const tier = c.automation[category] ?? "requires_approval";
  if (tier === "disabled") {
    v.push(deny("AUTOMATION_DISABLED", `automation disabled for ${category}`));
  } else if (tier === "requires_approval") {
    v.push(needsApproval("AUTOMATION_REQUIRES_APPROVAL", `${category} requires human approval`));
  }

  const hasDeny = v.some((x) => x.level === "deny");
  const hasApproval = v.some((x) => x.level === "needs_approval");
  const decision = hasDeny ? "deny" : hasApproval ? "needs_approval" : "allow";

  return {
    decision,
    violated_constraints: v,
    requires_approval: decision === "needs_approval",
    policy_version: policy.version,
  };
}
