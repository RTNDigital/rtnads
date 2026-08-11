import { describe, it, expect } from "vitest";
import { ScriptedLlmProvider, type LlmCompletionRequest } from "./index.js";

describe("ScriptedLlmProvider", () => {
  it("returns a fixed response with provider identity for provenance", async () => {
    const p = new ScriptedLlmProvider("hello", { model: "scripted-1", version: "0.0.0" });
    const res = await p.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(res.text).toBe("hello");
    expect(res).toMatchObject({ provider: "scripted", model: "scripted-1", version: "0.0.0" });
  });

  it("supports a responder function over the request (deterministic)", async () => {
    const p = new ScriptedLlmProvider((req: LlmCompletionRequest) =>
      req.messages[0]!.content.toUpperCase(),
    );
    const res = await p.complete({ messages: [{ role: "user", content: "abc" }] });
    expect(res.text).toBe("ABC");
  });
});
