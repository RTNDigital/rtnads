import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createRtnKnowledgeServer } from "./server.js";
import { InMemoryKnowledgeRepository } from "./memory-repo.js";

const CLIENT = "cccccccc-0000-0000-0000-000000000001";
const AUTHZ = { client_id: CLIENT, principal: "user:x", capabilities: ["knowledge.read"] };

const repo = new InMemoryKnowledgeRepository({
  taxonomy: [
    { key: "health-tourism", label: "Health Tourism", path: "health-tourism", level: 0 },
    { key: "rhinoplasty", label: "Rhinoplasty", path: "health-tourism/rhinoplasty", level: 1 },
    { key: "apparel", label: "Apparel", path: "ecommerce/apparel", level: 1 },
  ],
  playbooks: [
    { scope: { vertical: "health-tourism" }, title: "HT general", body_md: "...", version: 1, source: "rtn" },
    { scope: { vertical: "health-tourism", subcategory: "rhinoplasty", platform: "meta" }, title: "Rhino/Meta", body_md: "...", version: 1, source: "rtn" },
  ],
  benchmarks: [
    { scope: { vertical: "health-tourism", subcategory: "rhinoplasty", market: "uk" }, metric: "cpl", value: 4500, unit: "GBP_minor", sample: {}, source: "rtn", version: 1 },
    { scope: { vertical: "health-tourism", subcategory: "rhinoplasty", market: "uk" }, metric: "cost_per_qualified_lead", value: 6000, unit: "GBP_minor", sample: {}, source: "rtn", version: 1 },
  ],
  policies: { [CLIENT]: { version: 7, constraints: { note: "demo" } } },
});

async function connect() {
  const server = createRtnKnowledgeServer({ repo });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "it", version: "0.0.0" });
  await client.connect(ct);
  return client;
}

describe("RTN Knowledge MCP", () => {
  it("lists the knowledge tools", async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_optimization_policy", "get_taxonomy_subtree", "list_benchmarks", "read_resource", "resolve_playbook"]);
    await client.close();
  });

  it("resolves the MOST SPECIFIC playbook for a scope", async () => {
    const client = await connect();
    const res: any = await client.callTool({ name: "resolve_playbook", arguments: { authz: AUTHZ, scope: { vertical: "health-tourism", subcategory: "rhinoplasty", platform: "meta", market: "uk" } } });
    expect(res.structuredContent.playbook.title).toBe("Rhino/Meta");
    await client.close();
  });

  it("lists benchmarks filtered by metric", async () => {
    const client = await connect();
    const res: any = await client.callTool({ name: "list_benchmarks", arguments: { authz: AUTHZ, scope: { vertical: "health-tourism", subcategory: "rhinoplasty", market: "uk" }, metrics: ["cpl"] } });
    expect(res.structuredContent.benchmarks).toHaveLength(1);
    expect(res.structuredContent.benchmarks[0].value).toBe(4500);
    await client.close();
  });

  it("reads a benchmarks rtn:// resource", async () => {
    const client = await connect();
    const res: any = await client.callTool({ name: "read_resource", arguments: { authz: AUTHZ, uri: "rtn://benchmarks/health-tourism/rhinoplasty/uk" } });
    expect(res.structuredContent.kind).toBe("benchmarks");
    expect(res.structuredContent.content.length).toBe(2);
    await client.close();
  });

  it("returns the caller's optimization policy but denies cross-tenant URIs", async () => {
    const client = await connect();
    const ok: any = await client.callTool({ name: "get_optimization_policy", arguments: { authz: AUTHZ } });
    expect(ok.structuredContent.policy.version).toBe(7);
    const denied: any = await client.callTool({ name: "read_resource", arguments: { authz: AUTHZ, uri: "rtn://clients/bbbbbbbb-0000-0000-0000-000000000002/optimization-policy" } });
    expect(denied.isError).toBe(true);
    await client.close();
  });

  it("rejects a caller without knowledge.read", async () => {
    const client = await connect();
    const res: any = await client.callTool({ name: "resolve_playbook", arguments: { authz: { ...AUTHZ, capabilities: [] }, scope: {} } });
    expect(res.isError).toBe(true);
    await client.close();
  });
});
