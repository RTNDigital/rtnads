import { describe, it, expect, afterEach } from "vitest";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { startBffServer } from "./http.js";
import { InMemoryQueryStore, InMemoryControlOps, InMemoryLearningStore } from "./memory.js";
import type { BffDeps } from "./types.js";
import { AuthError } from "./auth.js";

/**
 * Health probes must answer BEFORE authentication (a load balancer / k8s probe
 * carries no token) and reflect dependency state. We start the real HTTP server on
 * an ephemeral port and hit it over the loopback, with an `authenticate` that
 * throws — so a 200 proves the probe never touched the auth path.
 */

const deps: BffDeps = {
  query: new InMemoryQueryStore(),
  control: new InMemoryControlOps(() => "2026-01-01T00:00:00.000Z", () => "id"),
  learning: new InMemoryLearningStore(),
};
const authenticateAlwaysFails = () => {
  throw new AuthError("no token");
};

let server: Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
});

async function start(readiness?: () => Promise<void>): Promise<string> {
  server = startBffServer({ deps, authenticate: authenticateAlwaysFails, port: 0, readiness });
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("BFF health probes", () => {
  it("liveness /healthz is 200 without authentication", async () => {
    const base = await start();
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("readiness /readyz is 200 when the dependency check passes", async () => {
    const base = await start(async () => {});
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("readiness /readyz is 503 when the dependency check throws", async () => {
    const base = await start(async () => {
      throw new Error("connection refused");
    });
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "not_ready" });
  });

  it("with no readiness probe configured, /readyz passes (in-memory default)", async () => {
    const base = await start();
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(200);
  });

  it("a real API route still requires auth (probe bypass is health-only)", async () => {
    const base = await start(async () => {});
    const res = await fetch(`${base}/v1/recommendations`);
    expect(res.status).toBe(401);
  });
});
