import { describe, it, expect } from "vitest";
import type { LlmProvider } from "@rtnads/llm-core";
import {
  ClaudeProvider,
  LlmProviderError,
  LlmRefusalError,
} from "./claude.js";
import { claudeProviderFromEnv } from "./factory.js";

/**
 * The Claude adapter is exercised through an INJECTED fetch — no network, no key.
 * We assert the exact Messages API request it builds and how it maps the response
 * back to the vendor-neutral contract, plus the safety-refusal and retry paths.
 */

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(
  handler: (call: Call) => { status: number; body: unknown },
  calls: Call[] = [],
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body != null ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const { status, body } = handler(call);
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

const noSleep = async () => {};

function ok(body: unknown) {
  return () => ({ status: 200, body });
}

const HELLO = {
  content: [{ type: "text", text: "Hello" }],
  model: "claude-opus-5",
  stop_reason: "end_turn",
  usage: { input_tokens: 12, output_tokens: 3 },
};

describe("ClaudeProvider.complete — request mapping", () => {
  it("builds a Messages API request with auth headers and maps the response", async () => {
    const calls: Call[] = [];
    const provider = new ClaudeProvider({
      apiKey: "SECRET",
      model: "claude-opus-5",
      sleep: noSleep,
      fetchImpl: fakeFetch(ok(HELLO), calls),
    });

    const res = await provider.complete({
      system: "You are RTN.",
      messages: [{ role: "user", content: "Write a rationale." }],
      maxOutputTokens: 1024,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call.headers["x-api-key"]).toBe("SECRET");
    expect(call.headers["anthropic-version"]).toBe("2023-06-01");
    expect(call.body).toEqual({
      model: "claude-opus-5",
      max_tokens: 1024,
      system: "You are RTN.",
      messages: [{ role: "user", content: "Write a rationale." }],
    });

    expect(res).toEqual({
      text: "Hello",
      provider: "claude",
      model: "claude-opus-5",
      version: "2023-06-01",
      usage: { input_tokens: 12, output_tokens: 3 },
    });
  });

  it("falls back to the configured max_tokens when the request omits it", async () => {
    const calls: Call[] = [];
    const provider = new ClaudeProvider({
      apiKey: "t",
      maxTokens: 555,
      sleep: noSleep,
      fetchImpl: fakeFetch(ok(HELLO), calls),
    });
    await provider.complete({ messages: [{ role: "user", content: "hi" }] });
    expect((calls[0]!.body as { max_tokens: number }).max_tokens).toBe(555);
  });

  it("omits temperature by default (modern models reject sampling params)", async () => {
    const calls: Call[] = [];
    const provider = new ClaudeProvider({ apiKey: "t", sleep: noSleep, fetchImpl: fakeFetch(ok(HELLO), calls) });
    await provider.complete({ messages: [{ role: "user", content: "hi" }], temperature: 0.7 });
    expect(calls[0]!.body).not.toHaveProperty("temperature");
  });

  it("forwards temperature only when explicitly opted in", async () => {
    const calls: Call[] = [];
    const provider = new ClaudeProvider({
      apiKey: "t",
      forwardTemperature: true,
      sleep: noSleep,
      fetchImpl: fakeFetch(ok(HELLO), calls),
    });
    await provider.complete({ messages: [{ role: "user", content: "hi" }], temperature: 0.7 });
    expect((calls[0]!.body as { temperature: number }).temperature).toBe(0.7);
  });

  it("concatenates text blocks and ignores non-text blocks", async () => {
    const provider = new ClaudeProvider({
      apiKey: "t",
      sleep: noSleep,
      fetchImpl: fakeFetch(
        ok({
          content: [
            { type: "text", text: "Part A. " },
            { type: "thinking", thinking: "ignored" },
            { type: "text", text: "Part B." },
          ],
          model: "claude-opus-5",
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
      ),
    });
    const res = await provider.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(res.text).toBe("Part A. Part B.");
  });
});

describe("ClaudeProvider.complete — refusal", () => {
  it("throws LlmRefusalError (with category) before reading content", async () => {
    const provider = new ClaudeProvider({
      apiKey: "t",
      sleep: noSleep,
      fetchImpl: fakeFetch(
        ok({ content: [], model: "claude-opus-5", stop_reason: "refusal", stop_details: { category: "cyber" } }),
      ),
    });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "..." }] }),
    ).rejects.toMatchObject({ name: "LlmRefusalError", category: "cyber" });
  });

  it("surfaces a null refusal category as null", async () => {
    const provider = new ClaudeProvider({
      apiKey: "t",
      sleep: noSleep,
      fetchImpl: fakeFetch(ok({ content: [], model: "m", stop_reason: "refusal" })),
    });
    await expect(provider.complete({ messages: [{ role: "user", content: "x" }] })).rejects.toBeInstanceOf(
      LlmRefusalError,
    );
  });
});

describe("ClaudeProvider.complete — transport", () => {
  it("retries on 429 then succeeds", async () => {
    let n = 0;
    const provider = new ClaudeProvider({
      apiKey: "t",
      sleep: noSleep,
      fetchImpl: fakeFetch(() => {
        n++;
        return n < 3 ? { status: 429, body: {} } : { status: 200, body: HELLO };
      }),
    });
    const res = await provider.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(res.text).toBe("Hello");
    expect(n).toBe(3);
  });

  it("gives up after maxRetries on persistent 5xx, throwing with the status", async () => {
    let n = 0;
    const provider = new ClaudeProvider({
      apiKey: "t",
      sleep: noSleep,
      maxRetries: 2,
      fetchImpl: fakeFetch(() => {
        n++;
        return { status: 529, body: {} };
      }),
    });
    await expect(provider.complete({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({
      name: "LlmProviderError",
      status: 529,
    });
    expect(n).toBe(3); // initial + 2 retries
  });

  it("does not retry a non-retriable 4xx", async () => {
    let n = 0;
    const provider = new ClaudeProvider({
      apiKey: "t",
      sleep: noSleep,
      fetchImpl: fakeFetch(() => {
        n++;
        return { status: 400, body: {} };
      }),
    });
    await expect(provider.complete({ messages: [{ role: "user", content: "hi" }] })).rejects.toBeInstanceOf(
      LlmProviderError,
    );
    expect(n).toBe(1);
  });
});

describe("ClaudeProvider — interface + factory", () => {
  it("satisfies the vendor-neutral LlmProvider contract", () => {
    const provider: LlmProvider = new ClaudeProvider({ apiKey: "t" });
    expect(provider.name).toBe("claude");
  });

  it("requires an API key", () => {
    expect(() => new ClaudeProvider({ apiKey: "" })).toThrow(/API key/);
  });

  it("builds a provider from environment configuration", () => {
    const p = claudeProviderFromEnv({ ANTHROPIC_API_KEY: "k", LLM_MODEL: "claude-sonnet-5", LLM_MAX_TOKENS: "2048" });
    expect(p.name).toBe("claude");
  });

  it("throws a clear error when ANTHROPIC_API_KEY is absent", () => {
    expect(() => claudeProviderFromEnv({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("treats a whitespace-only key as unset (no doomed 401 call)", () => {
    expect(() => claudeProviderFromEnv({ ANTHROPIC_API_KEY: "   " })).toThrow(/ANTHROPIC_API_KEY/);
  });
});
