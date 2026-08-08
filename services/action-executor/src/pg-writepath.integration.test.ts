import { describe, it, expect, afterAll } from "vitest";
import pg from "pg";
import { ActionExecutor, type PlatformConnector } from "./executor.js";
import { PgAuditLog } from "./pg-audit.js";
import { PgControlStore } from "./pg-control.js";
import { Action, type PolicyEvaluation } from "@rtnads/contracts";

/**
 * Real Postgres write-path integration (docs/11 §8). Runs when DATABASE_URL is
 * set. Persists an approved, policy-passed action, executes it, stores the
 * immutable record, and verifies the hash-chained audit in the database.
 */
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;
const CLIENT = "dddddddd-0000-0000-0000-00000000d001";
const ACCOUNT = "aaaaaaaa-0000-0000-0000-0000000000a1";

const evalNeedsApproval: PolicyEvaluation = {
  decision: "needs_approval",
  violated_constraints: [{ code: "AUTOMATION_REQUIRES_APPROVAL", detail: "x", level: "needs_approval" }],
  requires_approval: true,
  policy_version: 7,
};

const connector: PlatformConnector = {
  async applyMutation() {
    return { platform_response: { ok: true }, post_state: { budget_minor: 80000 } };
  },
  async revert() {
    return { platform_response: { reverted: true } };
  },
};

suite("Action Executor write-path over Postgres", () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(async () => {
    await pool.end();
  });

  it("persists an approved action, its immutable record, and an audited execution", async () => {
    await pool.query("INSERT INTO iam.client(id,name) VALUES ($1,'WritePath') ON CONFLICT DO NOTHING", [CLIENT]);

    const store = new PgControlStore(pool);
    const audit = new PgAuditLog(pool);

    const actionId = "eeeeeeee-0000-0000-0000-00000000e001";
    const approvalId = "ffffffff-0000-0000-0000-00000000f001";

    await store.insertApproval(CLIENT, {
      id: approvalId,
      recommendation_id: null,
      decided_by: "user:operator",
      decision: "approve",
      decided_at: "2026-08-08T12:05:00.000Z",
    });

    const action = Action.parse({
      id: actionId,
      client_id: CLIENT,
      approval_id: approvalId,
      entity: { type: "campaign", id: "22222222-2222-2222-2222-222222222222" },
      account_id: ACCOUNT,
      action_type: "update_budget",
      requested_change: { type: "percent", value: -0.2 },
      policy_evaluation: evalNeedsApproval,
      status: "approved",
      created_at: "2026-08-08T12:05:30.000Z",
    });
    await store.insertAction(action);

    let n = 0;
    const ids = ["11111111-2222-3333-4444-555555555551"];
    const executor = new ActionExecutor({
      connector,
      capturePreState: async () => ({ budget_minor: 100000 }),
      now: () => "2026-08-08T12:06:00.000Z",
      newId: () => ids[n++]!,
      auditLog: audit,
    });

    const record = await executor.execute(action);
    await store.insertActionRecord(CLIENT, record);
    await store.updateActionStatus(actionId, "executed");

    // Immutable record persisted exactly once.
    expect(await store.countActionRecords(actionId)).toBe(1);
    // The persisted record round-trips.
    const { rows } = await pool.query(
      "SELECT pre_state, post_state, executed_by FROM control.action_record WHERE id=$1",
      [record.id],
    );
    expect(rows[0].pre_state).toEqual({ budget_minor: 100000 });
    expect(rows[0].post_state).toEqual({ budget_minor: 80000 });

    // The audit chain in the database verifies.
    expect(await audit.verify()).toBe(true);
    const { rows: auditRows } = await pool.query(
      "SELECT action FROM control.audit_entry WHERE subject_ref=$1 ORDER BY seq",
      [`action:${actionId}`],
    );
    expect(auditRows.map((r) => r.action)).toContain("action.executed");
  });
});
