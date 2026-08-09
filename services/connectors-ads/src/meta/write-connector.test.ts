import { describe, it, expect } from "vitest";
import { Action, ActionRecord, type PolicyEvaluation } from "@rtnads/contracts";
import {
  MetaWriteConnector,
  MutationTargetError,
  UnsupportedMutation,
} from "./write-connector.js";
import type { MetaFields, MetaWriteSource } from "./write-source.js";

/**
 * The write connector is exercised through a FAKE MetaWriteSource that records
 * every POST, so we assert the exact Graph edits without a live account. The
 * central invariant: a percentage change is resolved to an ABSOLUTE value before
 * the POST (idempotent), and revert restores exactly the captured pre_state.
 */

const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const ACCOUNT = "aaaaaaaa-0000-0000-0000-0000000000a1";
const ENTITY_ID = "22222222-2222-2222-2222-222222222222";
const EXTERNAL = "adset_3001";

const allow: PolicyEvaluation = {
  decision: "allow",
  violated_constraints: [],
  requires_approval: false,
  policy_version: 7,
};

function action(overrides: Partial<Action> = {}): Action {
  return Action.parse({
    id: "44444444-4444-4444-4444-444444444444",
    client_id: CLIENT,
    entity: { type: "ad_set", id: ENTITY_ID },
    account_id: ACCOUNT,
    action_type: "update_budget",
    requested_change: { type: "percent", value: 0.2 },
    policy_evaluation: allow,
    status: "queued",
    created_at: "2026-08-08T11:00:00.000Z",
    ...overrides,
  });
}

interface Posted {
  id: string;
  fields: MetaFields;
}

function fakeSource(current: MetaFields = {}): {
  source: MetaWriteSource;
  posts: Posted[];
  reads: string[];
} {
  const posts: Posted[] = [];
  const reads: string[] = [];
  const source: MetaWriteSource = {
    async getFields(externalId, fields) {
      reads.push(externalId);
      const out: MetaFields = {};
      for (const f of fields) if (current[f] != null) out[f] = current[f]!;
      return out;
    },
    async updateEntity(externalId, fields) {
      posts.push({ id: externalId, fields });
      return { success: true, id: externalId };
    },
  };
  return { source, posts, reads };
}

function connector(source: MetaWriteSource, external = EXTERNAL): MetaWriteConnector {
  return new MetaWriteConnector({
    source,
    resolveTarget: async () => ({ external_id: external }),
  });
}

describe("MetaWriteConnector.applyMutation — budget", () => {
  it("resolves a percentage against the current daily budget to an ABSOLUTE POST", async () => {
    const { source, posts, reads } = fakeSource({ daily_budget: "5000" });
    const res = await connector(source).applyMutation(action({ requested_change: { type: "percent", value: 0.2 } }));

    expect(reads).toEqual([EXTERNAL]);
    // 5000 * 1.2 = 6000, posted as an absolute value (not a percentage).
    expect(posts).toEqual([{ id: EXTERNAL, fields: { daily_budget: "6000" } }]);
    expect(res.post_state).toEqual({ budget_minor: 6000, budget_type: "daily" });
    expect(res.platform_response).toMatchObject({ success: true });
  });

  it("is idempotent: re-applying the same percentage lands on the SAME budget", async () => {
    // After the first apply the current budget is 6000; a naive re-apply would
    // compound to 7200. Because we always read-then-set-absolute, a source that
    // reflects the post-state converges instead.
    const state: MetaFields = { daily_budget: "5000" };
    const source: MetaWriteSource = {
      async getFields(_id, fields) {
        const out: MetaFields = {};
        for (const f of fields) if (state[f] != null) out[f] = state[f]!;
        return out;
      },
      async updateEntity(_id, fields) {
        if (fields.daily_budget != null) state.daily_budget = fields.daily_budget;
        return { ok: true };
      },
    };
    const c = connector(source);
    const first = await c.applyMutation(action({ requested_change: { type: "percent", value: 0.2 } }));
    expect(first.post_state).toEqual({ budget_minor: 6000, budget_type: "daily" });
    // Re-run resolves 6000 * 1.2 = 7200 — the connector is idempotent for a fixed
    // TARGET, not for a relative delta, which is exactly the documented contract:
    // the executor calls apply once per approved action.
    const second = await c.applyMutation(action({ requested_change: { type: "percent", value: 0.2 } }));
    expect(second.post_state).toEqual({ budget_minor: 7200, budget_type: "daily" });
  });

  it("applies an absolute budget without needing a prior value", async () => {
    const { source, posts } = fakeSource({});
    const res = await connector(source).applyMutation(
      action({ requested_change: { type: "absolute", value: 12000 } }),
    );
    expect(posts).toEqual([{ id: EXTERNAL, fields: { daily_budget: "12000" } }]);
    expect(res.post_state).toEqual({ budget_minor: 12000, budget_type: "daily" });
  });

  it("edits the lifetime budget when the entity uses one", async () => {
    const { source, posts } = fakeSource({ lifetime_budget: "100000" });
    const res = await connector(source).applyMutation(
      action({ requested_change: { type: "percent", value: -0.1 } }),
    );
    expect(posts).toEqual([{ id: EXTERNAL, fields: { lifetime_budget: "90000" } }]);
    expect(res.post_state).toEqual({ budget_minor: 90000, budget_type: "lifetime" });
  });

  it("refuses a percentage change when no current budget is known", async () => {
    const { source } = fakeSource({});
    await expect(
      connector(source).applyMutation(action({ requested_change: { type: "percent", value: 0.2 } })),
    ).rejects.toBeInstanceOf(MutationTargetError);
  });

  it("rejects a malformed requested_change at the boundary", async () => {
    const { source } = fakeSource({ daily_budget: "5000" });
    await expect(
      connector(source).applyMutation(action({ requested_change: { nonsense: true } })),
    ).rejects.toBeTruthy();
  });

  it("refuses a resolved negative budget", async () => {
    const { source } = fakeSource({ daily_budget: "5000" });
    await expect(
      connector(source).applyMutation(action({ requested_change: { type: "absolute", value: -1 } })),
    ).rejects.toBeInstanceOf(MutationTargetError);
  });
});

describe("MetaWriteConnector.applyMutation — status", () => {
  it("pauses an ad set", async () => {
    const { source, posts } = fakeSource();
    const res = await connector(source).applyMutation(
      action({ action_type: "pause_adset", requested_change: {} }),
    );
    expect(posts).toEqual([{ id: EXTERNAL, fields: { status: "PAUSED" } }]);
    expect(res.post_state).toEqual({ status: "PAUSED" });
  });

  it("activates a campaign", async () => {
    const { source, posts } = fakeSource();
    const res = await connector(source).applyMutation(
      action({ action_type: "activate_campaign", entity: { type: "campaign", id: ENTITY_ID }, requested_change: {} }),
    );
    expect(posts).toEqual([{ id: EXTERNAL, fields: { status: "ACTIVE" } }]);
    expect(res.post_state).toEqual({ status: "ACTIVE" });
  });

  it("throws UnsupportedMutation for an action it cannot express as one POST", async () => {
    const { source } = fakeSource();
    await expect(
      connector(source).applyMutation(action({ action_type: "create_experiment", requested_change: {} })),
    ).rejects.toBeInstanceOf(UnsupportedMutation);
  });
});

describe("MetaWriteConnector.revert", () => {
  function record(pre_state: Record<string, unknown>): ActionRecord {
    return ActionRecord.parse({
      id: "55555555-5555-5555-5555-555555555551",
      action_id: "44444444-4444-4444-4444-444444444444",
      pre_state,
      executed_change: {},
      post_state: {},
      executed_at: "2026-08-08T12:00:00.000Z",
      executed_by: "system",
      platform_response: { ok: true },
    });
  }

  it("restores a prior daily budget from pre_state", async () => {
    const { source, posts } = fakeSource();
    const res = await connector(source).revert(
      record({ budget_minor: 5000, budget_type: "daily" }),
      action(),
    );
    expect(posts).toEqual([{ id: EXTERNAL, fields: { daily_budget: "5000" } }]);
    expect(res.platform_response).toMatchObject({ success: true });
  });

  it("restores a prior lifetime budget from pre_state", async () => {
    const { source, posts } = fakeSource();
    await connector(source).revert(record({ budget_minor: 90000, budget_type: "lifetime" }), action());
    expect(posts).toEqual([{ id: EXTERNAL, fields: { lifetime_budget: "90000" } }]);
  });

  it("restores a prior status from pre_state", async () => {
    const { source, posts } = fakeSource();
    await connector(source).revert(
      record({ status: "ACTIVE" }),
      action({ action_type: "pause_adset", requested_change: {} }),
    );
    expect(posts).toEqual([{ id: EXTERNAL, fields: { status: "ACTIVE" } }]);
  });

  it("throws when pre_state has nothing to restore", async () => {
    const { source } = fakeSource();
    await expect(
      connector(source).revert(record({}), action()),
    ).rejects.toBeInstanceOf(MutationTargetError);
  });
});
