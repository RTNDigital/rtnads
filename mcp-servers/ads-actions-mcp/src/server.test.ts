import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PolicyEngine } from "@rtnads/policy-engine";
import {
  OptimizationPolicy,
  type PolicyContext,
  type ProposedChange,
  type AutomationTier,
} from "@rtnads/contracts";
import { createAdsActionsServer } from "./server.js";
import type { ActionsToolContext } from "./tools.js";

const gbp = (amount_minor: number) => ({ amount_minor, currency: "GBP" });
const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const ACCOUNT = "aaaaaaaa-0000-0000-0000-0000000000a1";
const CAMPAIGN = { type: "campaign", id: "22222222-2222-2222-2222-222222222222" };
const ADSET = { type: "ad_set", id: "55555555-5555-5555-5555-555555555555" };

function makePolicy(automation: AutomationTier = "requires_approval"): OptimizationPolicy {
  return OptimizationPolicy.parse({
    version: 7,
    client_id: CLIENT,
    constraints: {
      budget_change: { max_percent: 0.25, max_absolute: gbp(50000) },
      evidence: { min_days: 7, min_conversions: 20, min_spend: gbp(30000) },
      cooldown: { budget_change_hours: 48, pause_hours: 24 },
      maturity: { min_campaign_state: "stabilizing" },
      automation: { budget_change: automation, pause: automation, activate: automation, experiment: automation },
      account_restrictions: { protected_accounts: [], excluded_actions: [] },
      experiment_protection: true,
      daily_spend_limit: gbp(200000),
    },
  });
}

const VALID_CTX: PolicyContext = {
  current_budget_minor: 100000,
  campaign_maturity: "mature",
  evidence_days: 14,
  conversions: 50,
  spend_minor: 100000,
  hours_since_last_change: 100,
  daily_spend_minor: 50000,
  active_experiment: false,
};

function makeCtx(opts: { policy: OptimizationPolicy | null; context?: PolicyContext }): ActionsToolContext {
  return {
    policyEngine: new PolicyEngine(),
    getPolicy: async () => opts.policy,
    getContext: async (_c: string, _change: ProposedChange) => opts.context ?? VALID_CTX,
    newId: () => "44444444-4444-4444-4444-444444444444",
  };
}

async function connect(ctx: ActionsToolContext) {
  const server = createAdsActionsServer(ctx);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "it", version: "0.0.0" });
  await client.connect(ct);
  return client;
}

const WRITE_AUTHZ = { client_id: CLIENT, principal: "user:x", capabilities: ["ads.read", "ads.action.request"] };
const budgetArgs = (value = 0.2) => ({ authz: WRITE_AUTHZ, entity: CAMPAIGN, account_id: ACCOUNT, change: { type: "percent", value } });

describe("Ads Actions MCP", () => {
  it("exposes preview + gated write tools", async () => {
    const client = await connect(makeCtx({ policy: makePolicy() }));
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["pause_adset", "preview_budget_change", "update_budget"]);
    await client.close();
  });

  it("a valid budget change is gated to pending_approval, never executed", async () => {
    const client = await connect(makeCtx({ policy: makePolicy("requires_approval") }));
    const res: any = await client.callTool({ name: "update_budget", arguments: budgetArgs() });
    expect(res.structuredContent.status).toBe("pending_approval");
    expect(res.structuredContent.action_id).toBeTruthy();
    expect(res.structuredContent.policy_evaluation.decision).toBe("needs_approval");
    // the invariant: a write tool NEVER reports execution
    expect(["rejected_by_policy", "pending_approval", "queued"]).toContain(res.structuredContent.status);
    await client.close();
  });

  it("a policy-violating change is rejected_by_policy with no action_id", async () => {
    const client = await connect(makeCtx({ policy: makePolicy() }));
    const res: any = await client.callTool({ name: "update_budget", arguments: budgetArgs(0.5) });
    expect(res.structuredContent.status).toBe("rejected_by_policy");
    expect(res.structuredContent.action_id).toBeNull();
    expect(res.structuredContent.policy_evaluation.violated_constraints.map((c: any) => c.code)).toContain("MAX_BUDGET_DELTA_PERCENT");
    await client.close();
  });

  it("queues when automation is auto and policy passes", async () => {
    const client = await connect(makeCtx({ policy: makePolicy("auto") }));
    const res: any = await client.callTool({ name: "update_budget", arguments: budgetArgs() });
    expect(res.structuredContent.status).toBe("queued");
    await client.close();
  });

  it("fails closed when no policy is configured", async () => {
    const client = await connect(makeCtx({ policy: null }));
    const res: any = await client.callTool({ name: "update_budget", arguments: budgetArgs() });
    expect(res.structuredContent.status).toBe("rejected_by_policy");
    expect(res.structuredContent.policy_evaluation.violated_constraints[0].code).toBe("NO_POLICY");
    await client.close();
  });

  it("pause_adset is gated the same way", async () => {
    const client = await connect(makeCtx({ policy: makePolicy() }));
    const res: any = await client.callTool({ name: "pause_adset", arguments: { authz: WRITE_AUTHZ, entity: ADSET, account_id: ACCOUNT, reason: "cost spike" } });
    expect(res.structuredContent.status).toBe("pending_approval");
    await client.close();
  });

  it("preview_budget_change is pure and shows the proposed budget + policy verdict", async () => {
    const client = await connect(makeCtx({ policy: makePolicy() }));
    const res: any = await client.callTool({ name: "preview_budget_change", arguments: { authz: { client_id: CLIENT, principal: "user:x", capabilities: ["ads.read"] }, entity: CAMPAIGN, account_id: ACCOUNT, change: { type: "percent", value: 0.2 } } });
    expect(res.structuredContent.proposed_budget).toEqual({ amount_minor: 120000, currency: "GBP" });
    expect(res.structuredContent.delta_percent).toBeCloseTo(0.2);
    expect(res.structuredContent.policy_preview.decision).toBe("needs_approval");
    await client.close();
  });

  it("rejects a write without the ads.action.request capability", async () => {
    const client = await connect(makeCtx({ policy: makePolicy() }));
    const res: any = await client.callTool({ name: "update_budget", arguments: { ...budgetArgs(), authz: { client_id: CLIENT, principal: "user:x", capabilities: ["ads.read"] } } });
    expect(res.isError).toBe(true);
    await client.close();
  });
});
