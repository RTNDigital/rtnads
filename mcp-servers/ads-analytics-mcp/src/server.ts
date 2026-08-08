import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ADS_ANALYTICS_TOOLS,
  AuthzError,
  type ToolContext,
  type ToolDef,
} from "./tools.js";
import { BENCHMARK_TOOLS } from "./tools-benchmark.js";

/** Register one typed tool, keeping I/O generics tied together. */
function registerTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  server: McpServer,
  ctx: ToolContext,
  def: ToolDef<I, O>,
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

/**
 * Builds the Ads Analytics MCP server: registers the read-only tools and wires
 * each to its deterministic handler. The server is a thin transport shell — it
 * validates I/O against contracts and never computes anything itself
 * (docs/04 §1). Authorization failures surface as MCP tool errors.
 */
export function createAdsAnalyticsServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: "rtn-ads-analytics", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Read-only advertising analytics for RTN House. All numbers are computed deterministically by the backend; this server never computes or mutates.",
    },
  );

  // Cohort/anomaly tools are registered only when a benchmark engine is wired.
  const tools: ReadonlyArray<ToolDef<z.ZodTypeAny, z.ZodTypeAny>> = [
    ...ADS_ANALYTICS_TOOLS,
    ...(ctx.benchmark ? BENCHMARK_TOOLS : []),
  ] as ReadonlyArray<ToolDef<z.ZodTypeAny, z.ZodTypeAny>>;

  for (const def of tools) registerTool(server, ctx, def);

  return server;
}
