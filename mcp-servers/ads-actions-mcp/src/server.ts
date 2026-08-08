import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ADS_ACTIONS_TOOLS,
  AuthzError,
  type ActionsToolContext,
  type ActionToolDef,
} from "./tools.js";

/**
 * Builds the Ads Actions MCP server. It exposes controlled mutation REQUESTS; the
 * Policy Engine (deterministic) gates every write and nothing executes here
 * (docs/04 §2.4). Authorization failures surface as MCP tool errors.
 */
function registerTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  server: McpServer,
  ctx: ActionsToolContext,
  def: ActionToolDef<I, O>,
): void {
  const inputShape = (def.inputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape;
  const outputShape = (def.outputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape;
  server.registerTool(
    def.name,
    { title: def.title, description: def.description, inputSchema: inputShape, outputSchema: outputShape },
    async (args: unknown) => {
      const input = def.inputSchema.parse(args) as z.infer<I>;
      try {
        const data = await def.handle(ctx, input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          structuredContent: data as Record<string, unknown>,
        };
      } catch (e) {
        if (e instanceof AuthzError) {
          return { content: [{ type: "text" as const, text: e.message }], isError: true };
        }
        throw e;
      }
    },
  );
}

export function createAdsActionsServer(ctx: ActionsToolContext): McpServer {
  const server = new McpServer(
    { name: "rtn-ads-actions", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Controlled advertising actions for RTN House. Every write is gated by the deterministic Policy Engine and requires human approval by default; this server never executes a mutation itself.",
    },
  );
  for (const def of ADS_ACTIONS_TOOLS) {
    registerTool(server, ctx, def as ActionToolDef<z.ZodTypeAny, z.ZodTypeAny>);
  }
  return server;
}
