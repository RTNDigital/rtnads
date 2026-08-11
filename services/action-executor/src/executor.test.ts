import { describe, it, expect } from "vitest";
import { ActionExecutor, ExecutionRefused, type PlatformConnector } from "./executor.js";
import { InMemoryAuditLog } from "./audit.js";
import { Action, type PolicyEvaluation } from "@rtnads/contracts";

const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const ACCOUNT = "aaaaaaaa-0000-0000-0000-0000000000a1";

function evaluation(decision: PolicyEvaluation["decision"]): PolicyEvaluation {
  return {
    decision,
    violated_constraints: decision === "deny" ? [{ code: "MAX_BUDGET_DELTA_PERCENT", detail: "x", level: "deny" }] : decision === "needs_approval" ? [{ code: "AUTOMATION_REQUIRES_APPROVAL", detail: "x", level: "needs_approval" }] : [],
    requires_approval: decision === "needs_approval",
    policy_version: 7,
  };
}

function action(decision: PolicyEvaluation["decision"], status: Action["status"]): Action {
  return Action.parse({
    id: "44444444-4444-4444-4444-444444444444",
    client_id: CLIENT,
    entity: { type: "campaign", id: "22222222-2222-2222-2222-222222222222" },
    account_id: ACCOUNT,
    action_type: "update_budget",
    requested_change: { type: "percent", value: 0.2 },
    policy_evaluation: evaluation(decision),
    status,
    created_at: "2026-08-08T11:00:00.000Z",
  });
}

const connector: PlatformConnector = {
  async applyMutation() {
    return { platform_response: { ok: true }, post_state: { budget_minor: 120000 } };
  },
  async revert() {
    return { platform_response: { reverted: true } };
  },
};

function makeExecutor(audit?: InMemoryAuditLog) {
  let n = 0;
  return new ActionExecutor({
    connector,
    capturePreState: async () => ({ budget_minor: 100000 }),
    now: () => "2026-08-08T12:00:00.000Z",
    newId: () => ["55555555-5555-5555-5555-555555555551", "55555555-5555-5555-5555-555555555552"][n++]!,
    auditLog: audit,
  });
}

describe("ActionExecutor preconditions (unbypassable)", () => {
  it("refuses a policy-denied action", async () => {
    await expect(makeExecutor().execute(action("deny", "approved"))).rejects.toBeInstanceOf(ExecutionRefused);
  });

  it("refuses a needs_approval action that is not approved", async () => {
    await expect(makeExecutor().execute(action("needs_approval", "pending_approval"))).rejects.toBeInstanceOf(ExecutionRefused);
  });
});

describe("ActionExecutor execution", () => {
  it("executes an approved action and writes an immutable record + audit", async () => {
    const audit = new InMemoryAuditLog();
    const rec = await makeExecutor(audit).execute(action("needs_approval", "approved"));
    expect(rec.pre_state).toEqual({ budget_minor: 100000 });
    expect(rec.post_state).toEqual({ budget_minor: 120000 });
    expect(rec.executed_by).toBe("system");
    expect(Object.isFrozen(rec)).toBe(true);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]!.action).toBe("action.executed");
    expect(audit.verify()).toBe(true);
  });

  it("executes an auto-allowed action without approval", async () => {
    const rec = await makeExecutor().execute(action("allow", "queued"));
    expect(rec.post_state).toEqual({ budget_minor: 120000 });
  });

  it("rolls back, restoring prior state, with an audit entry", async () => {
    const audit = new InMemoryAuditLog();
    const exec = makeExecutor(audit);
    const a = action("allow", "queued");
    const rec = await exec.execute(a);
    const rolled = await exec.rollback(rec, a);
    expect(rolled.rollback_ref).toBe(rec.id);
    expect(rolled.post_state).toEqual(rec.pre_state); // restored
    expect(audit.entries.map((e) => e.action)).toEqual(["action.executed", "action.rolled_back"]);
    expect(audit.verify()).toBe(true);
  });
});
