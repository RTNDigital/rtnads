import type {
  LlmProvider,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from "@rtnads/llm-core";

/**
 * Claude adapter (ADR-0003). The concrete `LlmProvider` that authors narratives
 * via Anthropic's Messages API in production, while `ScriptedLlmProvider` keeps
 * tests deterministic. Selecting this provider is a CONFIG change — the core RTN
 * platform depends only on the vendor-neutral `llm-core` interface, never on this
 * package (docs/01 §6, docs/07 §L5).
 *
 * Consistent with the rest of the platform's I/O boundaries (L1 connectors, the
 * BFF's OIDC verifier), this is a dependency-free `fetch` client: `fetch` and
 * `sleep` are injectable, so the provider is fully testable without a network or
 * a real key. The API credential lives ONLY here and is never logged, echoed into
 * a recommendation, or placed in a prompt (docs/09 §2).
 */

/** The Messages API contract version this adapter speaks (provenance stamp). */
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_BASE_URL = "https://api.anthropic.com";
/** Config default; overridable per request. Opus-tier is the reasoning default. */
const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_MAX_TOKENS = 4096;

/** The model declined the request for safety reasons (HTTP 200, stop_reason=refusal). */
export class LlmRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super(`model refused the request${category ? ` (${category})` : ""}`);
    this.name = "LlmRefusalError";
  }
}

/** A transport- or API-level failure (non-2xx after any retries). */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

export interface ClaudeProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  baseUrl?: string;
  anthropicVersion?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  baseDelayMs?: number;
  /**
   * Forward the neutral request's `temperature` to the API. OFF by default:
   * modern Claude models (Opus 5 / 4.8 / 4.7, Sonnet 5, Fable 5) REJECT sampling
   * parameters with a 400, so this adapter omits them unless a caller opts in for
   * an older model that still accepts them.
   */
  forwardTemperature?: boolean;
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicTextBlock[];
  model?: string;
  stop_reason?: string;
  stop_details?: { category?: string | null } | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class ClaudeProvider implements LlmProvider {
  readonly name = "claude";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly base: string;
  private readonly version: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly forwardTemperature: boolean;

  constructor(opts: ClaudeProviderOptions) {
    if (!opts.apiKey) throw new Error("Anthropic API key is required");
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.base = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.version = opts.anthropicVersion ?? ANTHROPIC_VERSION;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.forwardTemperature = opts.forwardTemperature ?? false;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: request.maxOutputTokens ?? this.maxTokens,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (request.system != null) body.system = request.system;
    // Only forward sampling for models that accept it (see forwardTemperature).
    if (this.forwardTemperature && request.temperature != null) {
      body.temperature = request.temperature;
    }

    const res = await this.postWithRetry(body);

    // A safety decline is a successful HTTP 200 with stop_reason=refusal and an
    // empty/partial content array — check it BEFORE reading any text block.
    if (res.stop_reason === "refusal") {
      throw new LlmRefusalError(res.stop_details?.category ?? null);
    }

    const text = (res.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");

    return {
      text,
      provider: this.name,
      model: res.model ?? this.model,
      version: this.version,
      usage: {
        input_tokens: res.usage?.input_tokens ?? 0,
        output_tokens: res.usage?.output_tokens ?? 0,
      },
    };
  }

  /** POST /v1/messages with bounded retry on 429 / 5xx (exponential backoff). */
  private async postWithRetry(body: Record<string, unknown>): Promise<AnthropicResponse> {
    const url = `${this.base}/v1/messages`;
    let attempt = 0;
    for (;;) {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": this.version,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as AnthropicResponse;
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= this.maxRetries) {
        throw new LlmProviderError(`Anthropic API ${res.status}`, res.status);
      }
      await this.sleep(this.baseDelayMs * 2 ** attempt);
      attempt++;
    }
  }
}
