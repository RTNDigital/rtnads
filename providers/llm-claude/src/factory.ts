import { ClaudeProvider, type ClaudeProviderOptions } from "./claude.js";

/**
 * Compose a Claude provider from environment configuration (ADR-0003: selecting a
 * provider is a config change, never a code change in the core). Kept tiny and
 * env-injectable so the composition root stays deterministic and testable.
 *
 * Reads: ANTHROPIC_API_KEY (required), LLM_MODEL, LLM_MAX_TOKENS,
 * ANTHROPIC_BASE_URL, ANTHROPIC_VERSION, LLM_FORWARD_TEMPERATURE=1.
 */
export function claudeProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): ClaudeProvider {
  // Trim so a whitespace-only value is treated as unset rather than producing a
  // live 401 from a blank key.
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — configure the Claude provider or use ScriptedLlmProvider for local runs",
    );
  }

  const opts: ClaudeProviderOptions = { apiKey };
  if (env.LLM_MODEL) opts.model = env.LLM_MODEL;
  if (env.ANTHROPIC_BASE_URL) opts.baseUrl = env.ANTHROPIC_BASE_URL;
  if (env.ANTHROPIC_VERSION) opts.anthropicVersion = env.ANTHROPIC_VERSION;
  if (env.LLM_FORWARD_TEMPERATURE === "1") opts.forwardTemperature = true;

  const maxTokens = env.LLM_MAX_TOKENS ? Number(env.LLM_MAX_TOKENS) : undefined;
  if (maxTokens != null && Number.isFinite(maxTokens)) opts.maxTokens = maxTokens;

  return new ClaudeProvider(opts);
}
