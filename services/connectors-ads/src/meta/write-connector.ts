import {
  BudgetChange,
  type Action,
  type ActionRecord,
  type ActionType,
  type MutationResult,
  type PlatformWriteConnector,
  type RevertResult,
} from "@rtnads/contracts";
import type { MetaFields, MetaWriteSource } from "./write-source.js";

/**
 * Meta write connector (docs/07 §Connectors, docs/11 §8). The L1 implementation of
 * the `PlatformWriteConnector` port that the L6 Action Executor drives — the ONLY
 * component permitted to mutate a Meta entity, and only for an action the executor
 * has already confirmed passed policy + approval.
 *
 * Design guarantees:
 *  - IDEMPOTENT writes: a percentage budget change is resolved to an absolute
 *    target from a fresh read BEFORE the POST, so a retried apply converges to the
 *    same budget instead of compounding it.
 *  - Reversible: `revert` restores exactly what the immutable `pre_state` captured
 *    (a prior budget or status), so a guardrail breach can be undone.
 *  - No credentials here: the token lives one layer down in the write source; this
 *    connector deals only in normalized ids and minor-unit integers.
 */

export class UnsupportedMutation extends Error {
  constructor(actionType: string) {
    super(`Meta connector cannot apply mutation of type "${actionType}"`);
    this.name = "UnsupportedMutation";
  }
}

export class MutationTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MutationTargetError";
  }
}

/** The platform-side address of the entity a mutation acts on. */
export interface WriteTarget {
  external_id: string;
}

export interface MetaWriteConnectorDeps {
  source: MetaWriteSource;
  /**
   * Resolve an internal EntityRef to its platform external id. Internal surrogate
   * ids are never sent to Meta (docs/common — external ids are not internal keys),
   * so the executor's action must be translated to a platform id first. In
   * production this is a warehouse lookup (core.* external_id); tests inject a map.
   */
  resolveTarget(action: Action): Promise<WriteTarget>;
}

const PAUSE_TYPES: ReadonlySet<ActionType> = new Set(["pause_ad", "pause_adset", "pause_campaign"]);
const ACTIVATE_TYPES: ReadonlySet<ActionType> = new Set(["activate_ad", "activate_adset", "activate_campaign"]);

export class MetaWriteConnector implements PlatformWriteConnector {
  readonly platform = "meta";

  constructor(private readonly deps: MetaWriteConnectorDeps) {}

  async applyMutation(action: Action): Promise<MutationResult> {
    const { external_id } = await this.deps.resolveTarget(action);

    if (action.action_type === "update_budget") {
      return this.applyBudget(action, external_id);
    }
    if (PAUSE_TYPES.has(action.action_type)) {
      return this.applyStatus(external_id, "PAUSED");
    }
    if (ACTIVATE_TYPES.has(action.action_type)) {
      return this.applyStatus(external_id, "ACTIVE");
    }
    // create_experiment and any future type has no deterministic single-POST form.
    throw new UnsupportedMutation(action.action_type);
  }

  async revert(record: ActionRecord, action: Action): Promise<RevertResult> {
    const { external_id } = await this.deps.resolveTarget(action);
    const pre = record.pre_state;

    if (typeof pre.status === "string") {
      const platform_response = await this.deps.source.updateEntity(external_id, { status: pre.status });
      return { platform_response };
    }
    if (typeof pre.budget_minor === "number") {
      const field = budgetField(pre.budget_type);
      const platform_response = await this.deps.source.updateEntity(external_id, {
        [field]: String(Math.round(pre.budget_minor)),
      });
      return { platform_response };
    }
    throw new MutationTargetError(
      "pre_state carries neither a status nor a budget_minor to restore",
    );
  }

  // ── update_budget ───────────────────────────────────────────────────────────
  private async applyBudget(action: Action, externalId: string): Promise<MutationResult> {
    // Runtime-validate the stored change at the boundary — a malformed request
    // fails here, before any platform write.
    const change = BudgetChange.parse(action.requested_change);

    const current = await this.deps.source.getFields(externalId, ["daily_budget", "lifetime_budget"]);
    const which = pickBudgetField(current);

    let target: number;
    if (change.type === "absolute") {
      target = Math.round(change.value);
    } else {
      // percent → resolve to an absolute target from the CURRENT value so the
      // POST is idempotent (a re-apply lands on the same number, not +20% again).
      if (which.currentMinor == null) {
        throw new MutationTargetError(
          "cannot apply a percentage budget change: no current budget on the entity",
        );
      }
      target = Math.round(which.currentMinor * (1 + change.value));
    }
    if (target < 0) throw new MutationTargetError("resolved budget target is negative");

    const platform_response = await this.deps.source.updateEntity(externalId, {
      [which.field]: String(target),
    });

    return {
      platform_response,
      post_state: { budget_minor: target, budget_type: which.kind },
    };
  }

  // ── pause_* / activate_* ─────────────────────────────────────────────────────
  private async applyStatus(externalId: string, status: "PAUSED" | "ACTIVE"): Promise<MutationResult> {
    const platform_response = await this.deps.source.updateEntity(externalId, { status });
    return { platform_response, post_state: { status } };
  }
}

type BudgetKind = "daily" | "lifetime";

function budgetField(kind: unknown): "daily_budget" | "lifetime_budget" {
  return kind === "lifetime" ? "lifetime_budget" : "daily_budget";
}

/**
 * Decide which budget field this entity uses. Meta ad sets carry either a daily
 * OR a lifetime budget; we edit whichever is currently set, defaulting to daily
 * when neither is present (a new absolute daily budget).
 */
function pickBudgetField(current: MetaFields): {
  field: "daily_budget" | "lifetime_budget";
  kind: BudgetKind;
  currentMinor: number | null;
} {
  if (current.lifetime_budget != null && current.daily_budget == null) {
    return { field: "lifetime_budget", kind: "lifetime", currentMinor: toMinor(current.lifetime_budget) };
  }
  return { field: "daily_budget", kind: "daily", currentMinor: toMinor(current.daily_budget) };
}

function toMinor(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
