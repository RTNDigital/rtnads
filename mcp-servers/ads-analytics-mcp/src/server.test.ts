import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  AnalyticsEngine,
  InMemoryAnalyticsRepository,
  type AnalyticsInputs,
} from "@rtnads/analytics-engine";
import { createAdsAnalyticsServer } from "./server.js";

/**
 * End-to-end MCP round-trip over an in-memory transport: a real MCP client calls
 * the server's tools and receives structured JSON — proving the read boundary
 * works exactly as the AI Orchestrator will use it (docs/04, docs/05 §A).
 */
const INPUTS: AnalyticsInputs = {
  entity: { type: "campaign", id: "22222222-2222-2222-2222-222222222222" },
  window: { start: "2026-07-01", end: "2026-07-31" },
  facts: { currency: "GBP", spend_minor: 360000, impressions: 200000, clicks: 5000, conversions: 100, conversion_value_minor: 0 },
  stages: [
    { key: "lead", label: "Lead", ordinal: 1 },
    { key: "qualified", label: "Qualified", ordinal: 3 },
    { key: "sale", label: "Sale", ordinal: 6 },
  ],
  funnel: { lead: 100, qualified: 40, sale: 8 },
  sales: { count: 8, revenue_minor: 1600000, margin_minor: null, currency: "GBP" },
  model: "health_tourism",
};

async function connectedClient() {
  const engine = new AnalyticsEngine(
    new InMemoryAnalyticsRepository(new Map([["22222222-2222-2222-2222-222222222222", INPUTS]])),
  );
  const server = createAdsAnalyticsServer({ engine, now: () => "2026-08-08T00:00:00.000Z" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

const AUTHZ = {
  client_id: "11111111-1111-1111-1111-111111111111",
  principal: "user:11111111-1111-1111-1111-111111111111",
  capabilities: ["ads.read"],
};
const CALL = {
  authz: AUTHZ,
  entity: { type: "campaign", id: "22222222-2222-2222-2222-222222222222" },
  window: { start: "2026-07-01", end: "2026-07-31" },
  model: "health_tourism",
};

describe("Ads Analytics MCP (round-trip)", () => {
  it("lists the read-only tools", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "calculate_unit_economics",
      "get_entity_metrics",
      "get_sales_performance",
    ]);
    await client.close();
  });

  it("returns structured unit economics via callTool", async () => {
    const client = await connectedClient();
    const res: any = await client.callTool({
      name: "calculate_unit_economics",
      arguments: CALL,
    });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent.unit_economics.cost_per_qualified_lead).toEqual({
      amount_minor: 9000,
      currency: "GBP",
    });
    await client.close();
  });

  it("surfaces an authorization failure as a tool error", async () => {
    const client = await connectedClient();
    const res: any = await client.callTool({
      name: "calculate_unit_economics",
      arguments: { ...CALL, authz: { ...AUTHZ, capabilities: [] } },
    });
    expect(res.isError).toBe(true);
    await client.close();
  });
});
