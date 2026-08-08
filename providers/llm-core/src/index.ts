/**
 * @rtnads/llm-core — the model-agnostic LLM boundary (ADR-0003).
 *
 * The orchestrator depends ONLY on this vendor-neutral interface. Concrete
 * providers (Claude, others) implement it and are selected by configuration, so
 * the core RTN platform is never coupled to a single LLM vendor. No provider ever
 * receives credentials or PII (docs/09) — it only sees the prompt the
 * orchestrator constructs from already-safe, deterministic evidence.
 */

export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCompletionRequest {
  system?: string;
  messages: LlmMessage[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface LlmCompletionResponse {
  text: string;
  /** Provider identity for provenance/audit (docs/03 model_provenance). */
  provider: string;
  model: string;
  version: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface LlmProvider {
  readonly name: string;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}

/**
 * A deterministic, offline provider for tests and CI. It returns scripted text
 * (optionally chosen by a matcher over the prompt), so orchestration can be
 * exercised end-to-end without a network or a real model.
 */
export class ScriptedLlmProvider implements LlmProvider {
  readonly name = "scripted";
  constructor(
    private readonly responder: string | ((req: LlmCompletionRequest) => string),
    private readonly identity: { model: string; version: string } = {
      model: "scripted-1",
      version: "0.0.0",
    },
  ) {}

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const text =
      typeof this.responder === "function" ? this.responder(req) : this.responder;
    return {
      text,
      provider: this.name,
      model: this.identity.model,
      version: this.identity.version,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
}
