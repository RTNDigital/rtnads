import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCrmServer } from "./server.js";
import { InMemoryCrmRepository } from "./memory-repo.js";

const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const CAMPAIGN = { type: "campaign", id: "22222222-2222-2222-2222-222222222222" };
const AUTHZ = { client_id: CLIENT, principal: "user:x", capabilities: ["crm.read"] };
const WINDOW = { start: "2026-07-01", end: "2026-07-31" };

const repo = new InMemoryCrmRepository(
  new Map([
    [
      CAMPAIGN.id,
      {
        quality: { bands: [{ band: "high", count: 4, share: 0.4 }, { band: "mid", count: 3, share: 0.3 }, { band: "low", count: 3, share: 0.3 }], qualification_rate: 0.4, sample_size: 10 },
        funnel: { stages: [{ from: "lead", to: "qualified", rate: 0.4, n: 10 }, { from: "qualified", to: "sale", rate: 0.25, n: 4 }], overall_lead_to_sale: 0.1 },
        sales: { sales: 1, revenue_minor: 500000, currency: "GBP", avg_order_value_minor: 500000, sales_quality: [{ band: "premium", count: 1 }] },
      },
    ],
  ]),
);

async function connect() {
  const server = createCrmServer({ repo });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "it", version: "0.0.0" });
  await client.connect(ct);
  return client;
}

describe("CRM MCP (anonymized)", () => {
  it("lists the anonymized CRM tools", async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_funnel_conversion", "get_lead_quality_distribution", "get_sales_outcomes"]);
    await client.close();
  });

  it("returns lead-quality bands + qualification rate (no PII fields)", async () => {
    const client = await connect();
    const res: any = await client.callTool({ name: "get_lead_quality_distribution", arguments: { authz: AUTHZ, entity: CAMPAIGN, window: WINDOW } });
    expect(res.structuredContent.qualification_rate).toBe(0.4);
    // the whole payload contains no identifying fields
    const blob = JSON.stringify(res.structuredContent);
    for (const forbidden of ["pseudonym", "email", "phone", "name", "@"]) {
      expect(blob.toLowerCase()).not.toContain(forbidden);
    }
    await client.close();
  });

  it("returns funnel conversion and sales outcomes", async () => {
    const client = await connect();
    const f: any = await client.callTool({ name: "get_funnel_conversion", arguments: { authz: AUTHZ, entity: CAMPAIGN, window: WINDOW } });
    expect(f.structuredContent.overall_lead_to_sale).toBe(0.1);
    const s: any = await client.callTool({ name: "get_sales_outcomes", arguments: { authz: AUTHZ, entity: CAMPAIGN, window: WINDOW } });
    expect(s.structuredContent.revenue_minor).toBe(500000);
    await client.close();
  });

  it("rejects a caller without crm.read", async () => {
    const client = await connect();
    const res: any = await client.callTool({ name: "get_sales_outcomes", arguments: { authz: { ...AUTHZ, capabilities: [] }, entity: CAMPAIGN, window: WINDOW } });
    expect(res.isError).toBe(true);
    await client.close();
  });
});
