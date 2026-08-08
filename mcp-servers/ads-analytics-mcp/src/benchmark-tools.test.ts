import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  BenchmarkEngine,
  InMemoryBenchmarkRepository,
  type BenchmarkDataset,
} from "@rtnads/benchmark-engine";
import {
  AnalyticsEngine,
  InMemoryAnalyticsRepository,
} from "@rtnads/analytics-engine";
import { createAdsAnalyticsServer } from "./server.js";

/**
 * Round-trip tests for the cohort/anomaly MCP tools backed by the Benchmark
 * Engine. Uses valid UUID entity ids (the MCP boundary validates them).
 */
const SUBJECT_ID = "22222222-2222-2222-2222-222222222222";
const CTX = {
  vertical: "health-tourism",
  subcategory: "health-tourism/rhinoplasty",
  market: "uk",
  platform: "meta",
  objective: "leads",
  conversion_type: "form-lead",
  budget_range: "mid",
  campaign_maturity: "mature",
};

const dataset: BenchmarkDataset = {
  subject: {
    entity: { type: "campaign", id: SUBJECT_ID },
    context: CTX,
    metricValue: 20000,
    series: [
      { date: "2026-07-01", value: 50 },
      { date: "2026-07-02", value: 52 },
      { date: "2026-07-03", value: 48 },
      { date: "2026-07-04", value: 51 },
      { date: "2026-07-05", value: 49 },
      { date: "2026-07-06", value: 200 },
      { date: "2026-07-07", value: 50 },
      { date: "2026-07-08", value: 51 },
    ],
  },
  candidates: [
    { entity: { type: "campaign", id: "aaaaaaaa-0000-0000-0000-00000000000a" }, context: { ...CTX }, metricValue: 12000, ageDays: 20, sampleSize: 200, dataQuality: 0.95 },
    { entity: { type: "campaign", id: "aaaaaaaa-0000-0000-0000-00000000000b" }, context: { ...CTX, subcategory: "health-tourism/dental", market: "de" }, metricValue: 18000, ageDays: 30, sampleSize: 150, dataQuality: 0.9 },
    { entity: { type: "campaign", id: "aaaaaaaa-0000-0000-0000-00000000000c" }, context: { ...CTX }, metricValue: 9000, ageDays: 900, sampleSize: 30, dataQuality: 0.6 },
    { entity: { type: "campaign", id: "aaaaaaaa-0000-0000-0000-00000000000d" }, context: { vertical: "ecommerce", subcategory: "ecommerce/apparel", market: "us", platform: "google", objective: "sales", conversion_type: "purchase", budget_range: "high", campaign_maturity: "mature" }, metricValue: 5000, ageDays: 100, sampleSize: 100, dataQuality: 0.9 },
  ],
  metric: "cost_per_qualified_lead",
  lowerIsBetter: true,
};

async function connectedClient() {
  const analytics = new AnalyticsEngine(new InMemoryAnalyticsRepository(new Map()));
  const benchmark = new BenchmarkEngine(
    new InMemoryBenchmarkRepository(new Map([[SUBJECT_ID, dataset]])),
  );
  const server = createAdsAnalyticsServer({
    engine: analytics,
    benchmark,
    now: () => "2026-08-08T00:00:00.000Z",
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "it", version: "0.0.0" });
  await client.connect(ct);
  return client;
}

const AUTHZ = {
  client_id: "11111111-1111-1111-1111-111111111111",
  principal: "user:x",
  capabilities: ["ads.read"],
};
const SUBJECT = { type: "campaign", id: SUBJECT_ID };
const WINDOW = { start: "2026-07-01", end: "2026-07-31" };

describe("benchmark MCP tools (round-trip)", () => {
  it("exposes the cohort/anomaly tools when a benchmark engine is wired", async () => {
    const client = await connectedClient();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "find_similar_campaigns",
        "compare_with_cohort",
        "detect_anomalies",
      ]),
    );
    await client.close();
  });

  it("find_similar_campaigns returns an influence-weighted cohort", async () => {
    const client = await connectedClient();
    const res: any = await client.callTool({
      name: "find_similar_campaigns",
      arguments: { authz: AUTHZ, subject: SUBJECT, metric: "cost_per_qualified_lead", window: WINDOW },
    });
    expect(res.isError).toBeFalsy();
    const ids = res.structuredContent.members.map((m: any) => m.campaign.id);
    expect(ids).not.toContain("aaaaaaaa-0000-0000-0000-00000000000d"); // filtered
    expect(ids[0]).toBe("aaaaaaaa-0000-0000-0000-00000000000a"); // most influential
    await client.close();
  });

  it("compare_with_cohort assesses the subject", async () => {
    const client = await connectedClient();
    const res: any = await client.callTool({
      name: "compare_with_cohort",
      arguments: { authz: AUTHZ, subject: SUBJECT, metric: "cost_per_qualified_lead", window: WINDOW },
    });
    expect(res.structuredContent.comparison.assessment).toBe("underperforming");
    await client.close();
  });

  it("detect_anomalies flags the spike", async () => {
    const client = await connectedClient();
    const res: any = await client.callTool({
      name: "detect_anomalies",
      arguments: { authz: AUTHZ, subject: SUBJECT, metric: "cpl", window: WINDOW },
    });
    expect(res.structuredContent.anomalies).toHaveLength(1);
    expect(res.structuredContent.anomalies[0].kind).toBe("spike");
    await client.close();
  });
});
