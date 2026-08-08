import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { BffDeps, Principal } from "./types.js";
import { BffRouter } from "./router.js";

/**
 * Thin Node HTTP adapter for the BFF. Authentication is out of scope for the demo
 * runner: a principal resolver supplies the session identity (in production this
 * is an OIDC session). The router then enforces RBAC + tenancy. Also serves the
 * static operator console at `/`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CONSOLE_HTML = join(here, "..", "public", "console.html");

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve(undefined);
      try { resolve(JSON.parse(data)); } catch { resolve(undefined); }
    });
  });
}

export interface HttpServerOptions {
  deps: BffDeps;
  resolvePrincipal: (req: IncomingMessage) => Principal;
  port: number;
}

export function startBffServer(opts: HttpServerOptions) {
  const router = new BffRouter(opts.deps);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    try {
      if (req.method === "GET" && (url === "/" || url === "/index.html")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(readFileSync(CONSOLE_HTML));
        return;
      }
      if (!url.startsWith("/v1/")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      const principal = opts.resolvePrincipal(req);
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const result = await router.dispatch(principal, { method: req.method ?? "GET", path: url, body });
      res.writeHead(result.status, { "content-type": "application/json" });
      res.end(JSON.stringify(result.body));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "internal", message: (e as Error).message }));
    }
  });

  server.listen(opts.port, () => {
    console.log(`BFF listening on http://localhost:${opts.port}`);
  });
  return server;
}
