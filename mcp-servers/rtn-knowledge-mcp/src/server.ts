import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Authz } from "@rtnads/contracts";
import type { KnowledgeRepository } from "./types.js";

/**
 * RTN Knowledge MCP (docs/04 §2.2). Read-only Strategy Memory exposed as typed
 * lookup tools plus a `read_resource` tool that resolves rtn:// URIs. Thin
 * adapter over a KnowledgeRepository; no business logic here.
 */

class AuthzError extends Error {
  constructor(m: string) { super(m); this.name = "AuthzError"; }
}
function requireCap(a: z.infer<typeof Authz>, cap: string): void {
  if (!a.capabilities.includes(cap)) throw new AuthzError(`missing capability: ${cap}`);
}

export interface KnowledgeToolContext {
  repo: KnowledgeRepository;
}

const Scope = z.record(z.string(), z.string());

async function resolveUri(
  ctx: KnowledgeToolContext,
  authz: z.infer<typeof Authz>,
  uri: string,
): Promise<{ uri: string; kind: string; content: unknown }> {
  const m = uri.match(/^rtn:\/\/(.+)$/);
  if (!m) throw new AuthzError(`unsupported uri: ${uri}`);
  const parts = m[1]!.split("/");
  if (parts[0] === "taxonomy" && parts[1]) {
    return { uri, kind: "taxonomy", content: await ctx.repo.getTaxonomySubtree(parts[1]) };
  }
  if (parts[0] === "playbooks" && parts[1] && parts[2] && parts[3]) {
    const scope = { vertical: parts[1], subcategory: parts[2], platform: parts[3] };
    return { uri, kind: "playbook", content: await ctx.repo.resolvePlaybook(scope) };
  }
  if (parts[0] === "benchmarks" && parts[1] && parts[2] && parts[3]) {
    const scope = { vertical: parts[1], subcategory: parts[2], market: parts[3] };
    return { uri, kind: "benchmarks", content: await ctx.repo.listBenchmarks(scope) };
  }
  if (parts[0] === "clients" && parts[1] && parts[2] === "optimization-policy") {
    if (parts[1] !== authz.client_id) throw new AuthzError("cross-tenant policy access denied");
    return { uri, kind: "optimization-policy", content: await ctx.repo.getOptimizationPolicy(parts[1]) };
  }
  throw new AuthzError(`unresolvable uri: ${uri}`);
}

interface Tool { name: string; title: string; description: string; input: z.ZodObject<z.ZodRawShape>; run(ctx: KnowledgeToolContext, a: any): Promise<unknown>; }

const TOOLS: Tool[] = [
  {
    name: "get_taxonomy_subtree",
    title: "Get taxonomy subtree",
    description: "Return the industry taxonomy subtree under a vertical key.",
    input: z.object({ authz: Authz, vertical: z.string() }),
    async run(ctx, a) { requireCap(a.authz, "knowledge.read"); return { nodes: await ctx.repo.getTaxonomySubtree(a.vertical) }; },
  },
  {
    name: "resolve_playbook",
    title: "Resolve playbook",
    description: "Return the most specific RTN playbook matching a context scope.",
    input: z.object({ authz: Authz, scope: Scope }),
    async run(ctx, a) { requireCap(a.authz, "knowledge.read"); return { playbook: await ctx.repo.resolvePlaybook(a.scope) }; },
  },
  {
    name: "list_benchmarks",
    title: "List benchmarks",
    description: "Return curated RTN benchmarks matching a scope (optionally filtered by metric).",
    input: z.object({ authz: Authz, scope: Scope, metrics: z.array(z.string()).optional() }),
    async run(ctx, a) { requireCap(a.authz, "knowledge.read"); return { benchmarks: await ctx.repo.listBenchmarks(a.scope, a.metrics) }; },
  },
  {
    name: "get_optimization_policy",
    title: "Get optimization policy",
    description: "Return the caller's client optimization policy (tenant-scoped).",
    input: z.object({ authz: Authz }),
    async run(ctx, a) { requireCap(a.authz, "knowledge.read"); return { policy: await ctx.repo.getOptimizationPolicy(a.authz.client_id) }; },
  },
  {
    name: "read_resource",
    title: "Read rtn:// resource",
    description: "Resolve an rtn:// Strategy Memory resource URI to its content.",
    input: z.object({ authz: Authz, uri: z.string() }),
    async run(ctx, a) { requireCap(a.authz, "knowledge.read"); return resolveUri(ctx, a.authz, a.uri); },
  },
];

export function createRtnKnowledgeServer(ctx: KnowledgeToolContext): McpServer {
  const server = new McpServer(
    { name: "rtn-knowledge", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: "Read-only RTN House Strategy Memory: playbooks, benchmarks and optimization policies." },
  );
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      { title: t.title, description: t.description, inputSchema: t.input.shape },
      async (args: unknown) => {
        const input = t.input.parse(args);
        try {
          const data = await t.run(ctx, input);
          return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> };
        } catch (e) {
          if (e instanceof AuthzError) return { content: [{ type: "text" as const, text: e.message }], isError: true };
          throw e;
        }
      },
    );
  }
  return server;
}

export { AuthzError };
