import { describe, it, expect } from "vitest";
import { HttpMetaWriteSource } from "./write-source.js";

/**
 * The live write source is tested with an INJECTED fetch — no network, no account.
 * We prove the POST carries the token + fields form-encoded, that reads project
 * only the requested fields, that retries back off on 429/5xx, and that the token
 * never appears in an error (only REDACTED does).
 */

interface Call {
  url: string;
  method: string;
  body?: string;
}

function fakeFetch(
  handler: (call: Call) => { status: number; body: unknown },
  calls: Call[] = [],
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body != null ? String(init.body) : undefined,
    };
    calls.push(call);
    const { status, body } = handler(call);
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

const noSleep = async () => {};

describe("HttpMetaWriteSource.getFields", () => {
  it("projects only the requested fields, as strings", async () => {
    const src = new HttpMetaWriteSource({
      accessToken: "t",
      sleep: noSleep,
      fetchImpl: fakeFetch(() => ({
        status: 200,
        body: { id: "adset_1", daily_budget: 5000, status: "ACTIVE", name: "ignored" },
      })),
    });
    const fields = await src.getFields("adset_1", ["daily_budget", "lifetime_budget"]);
    expect(fields).toEqual({ daily_budget: "5000" });
  });
});

describe("HttpMetaWriteSource.updateEntity", () => {
  it("POSTs the token and fields form-encoded to /{id}", async () => {
    const calls: Call[] = [];
    const src = new HttpMetaWriteSource({
      accessToken: "SECRET",
      apiVersion: "v21.0",
      sleep: noSleep,
      fetchImpl: fakeFetch(() => ({ status: 200, body: { success: true } }), calls),
    });
    const res = await src.updateEntity("adset_1", { daily_budget: "6000" });
    expect(res).toMatchObject({ success: true });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/v21.0/adset_1");
    const params = new URLSearchParams(call.body);
    expect(params.get("daily_budget")).toBe("6000");
    expect(params.get("access_token")).toBe("SECRET");
  });

  it("retries on 500 then succeeds (safe because writes are absolute)", async () => {
    let n = 0;
    const src = new HttpMetaWriteSource({
      accessToken: "t",
      sleep: noSleep,
      fetchImpl: fakeFetch(() => {
        n++;
        return n < 3 ? { status: 500, body: {} } : { status: 200, body: { ok: true } };
      }),
    });
    await expect(src.updateEntity("adset_1", { status: "PAUSED" })).resolves.toMatchObject({ ok: true });
    expect(n).toBe(3);
  });

  it("throws a non-retriable 4xx without leaking the token (POST carries it in the body)", async () => {
    const src = new HttpMetaWriteSource({
      accessToken: "SUPER_SECRET",
      sleep: noSleep,
      fetchImpl: fakeFetch(() => ({ status: 400, body: {} })),
    });
    // The POST token lives in the body, so it is never in the error URL at all.
    await expect(src.updateEntity("adset_1", { status: "PAUSED" })).rejects.not.toThrow(/SUPER_SECRET/);
  });

  it("redacts the token from a GET error (it rides in the query string)", async () => {
    const src = new HttpMetaWriteSource({
      accessToken: "SUPER_SECRET",
      sleep: noSleep,
      fetchImpl: fakeFetch(() => ({ status: 400, body: {} })),
    });
    await expect(src.getFields("adset_1", ["daily_budget"])).rejects.toThrow(/REDACTED/);
    await expect(src.getFields("adset_1", ["daily_budget"])).rejects.not.toThrow(/SUPER_SECRET/);
  });

  it("gives up after maxRetries on persistent 429", async () => {
    let n = 0;
    const src = new HttpMetaWriteSource({
      accessToken: "t",
      sleep: noSleep,
      maxRetries: 2,
      fetchImpl: fakeFetch(() => {
        n++;
        return { status: 429, body: {} };
      }),
    });
    await expect(src.updateEntity("adset_1", { status: "PAUSED" })).rejects.toThrow(/Meta API 429/);
    expect(n).toBe(3); // initial + 2 retries
  });
});
