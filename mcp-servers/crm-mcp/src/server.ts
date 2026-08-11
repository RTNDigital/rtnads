import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Authz, EntityRef, DateWindow } from "@rtnads/contracts";
import type { CrmRepository } from "./types.js";

/**
 * CRM MCP (docs/04 §2.3). Read-only, ANONYMIZED lead-quality and sales-outcome
 * tools. Thin adapter over a CrmRepository; the tool outputs cannot express PII.
 */
class AuthzError extends Error {
  constructor(m: string) { super(m); this.name = "AuthzError"; }
}
function requireCap(a: z.infer<typeof Authz>, cap: string): void {
  if (!a.capabilities.includes(cap)) throw new AuthzError(`missing capability: ${cap}`);
}

export interface CrmToolContext { repo: CrmRepository; }

const EntityInput = z.object({ authz: Authz, entity: EntityRef, window: DateWindow });

interface Tool { name: string; title: string; description: string; run(ctx: CrmToolContext, a: z.infer<typeof EntityInput>): Promise<unknown>; }

const TOOLS: Tool[] = [
  {
    name: "get_lead_quality_distribution",
    title: "Get lead-quality distribution",
    description: "Anonymized lead-quality bands and qualification rate for an entity.",
    async run(ctx, a) { requireCap(a.authz, "crm.read"); return ctx.repo.leadQualityDistribution(a.authz.client_id, a.entity, a.window); },
  },
  {
    name: "get_funnel_conversion",
    title: "Get funnel conversion",
    description: "Stage-to-stage conversion rates and overall lead-to-sale rate for an entity.",
    async run(ctx, a) { requireCap(a.authz, "crm.read"); return ctx.repo.funnelConversion(a.authz.client_id, a.entity, a.window); },
  },
  {
    name: "get_sales_outcomes",
    title: "Get sales outcomes",
    description: "Anonymized sales count, revenue, average order value and sales-quality bands.",
    async run(ctx, a) { requireCap(a.authz, "crm.read"); return ctx.repo.salesOutcomes(a.authz.client_id, a.entity, a.window); },
  },
];

export function createCrmServer(ctx: CrmToolContext): McpServer {
  const server = new McpServer(
    { name: "rtn-crm", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: "Read-only, anonymized CRM outcomes for RTN House. No PII is exposed." },
  );
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      { title: t.title, description: t.description, inputSchema: EntityInput.shape },
      async (args: unknown) => {
        const input = EntityInput.parse(args);
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
