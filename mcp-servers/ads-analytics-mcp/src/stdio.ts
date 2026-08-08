/**
 * Stdio entrypoint for the Ads Analytics MCP server.
 *
 * Wires a Postgres-backed Analytics Engine and serves the read-only tools over
 * stdio. Credentials come from the environment (DATABASE_URL) — never from the
 * LLM (docs/09 §2). Run:  DATABASE_URL=… node dist/stdio.js
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pg from "pg";
import { AnalyticsEngine, PgAnalyticsRepository } from "@rtnads/analytics-engine";
import { createAdsAnalyticsServer } from "./server.js";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url });
  const engine = new AnalyticsEngine(new PgAnalyticsRepository(pool));
  const server = createAdsAnalyticsServer({ engine });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The process now serves tool calls over stdio until the transport closes.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
