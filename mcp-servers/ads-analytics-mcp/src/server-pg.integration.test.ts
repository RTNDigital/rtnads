import { describe, it, expect, afterAll } from "vitest";
import pg from "pg";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AnalyticsEngine, PgAnalyticsRepository } from "@rtnads/analytics-engine";
import { createAdsAnalyticsServer } from "./server.js";

/**
 * Full-stack integration: MCP client → server → engine → Postgres. Runs when
 * DATABASE_URL and CRM_LOADED=1 are set (CI, after ads + CRM read-paths). Proves
 * the AI's read boundary returns real, deterministic numbers off the warehouse.
 */
const url = process.env.DATABASE_URL;
const enabled = url && process.env.CRM_LOADED === "1";
const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const suite = enabled ? describe : describe.skip;

suite("Ads Analytics MCP over Postgres (full stack)", () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(async () => {
    await pool.end();
  });

  it("serves CRM-driven unit economics through a real MCP call", async () => {
    const { rows } = await pool.query(
      "SELECT id FROM core.campaign WHERE external_id='camp_2001' AND client_id=$1",
      [CLIENT],
    );
    const campaignId = rows[0].id;

    const engine = new AnalyticsEngine(new PgAnalyticsRepository(pool));
    const server = createAdsAnalyticsServer({ engine });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: "it", version: "0.0.0" });
    await client.connect(ct);

    const res: any = await client.callTool({
      name: "calculate_unit_economics",
      arguments: {
        authz: {
          client_id: CLIENT,
          principal: "system:test",
          capabilities: ["ads.read"],
        },
        entity: { type: "campaign", id: campaignId },
        window: { start: "2026-07-01", end: "2026-07-31" },
        model: "health_tourism",
      },
    });

    expect(res.isError).toBeFalsy();
    // Post-CRM: 4 qualified leads over £105.10 spend → £26.28 per qualified lead.
    expect(res.structuredContent.unit_economics.cost_per_qualified_lead).toEqual({
      amount_minor: 2628,
      currency: "GBP",
    });
    await client.close();
  });
});
