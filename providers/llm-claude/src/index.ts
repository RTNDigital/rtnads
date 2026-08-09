/**
 * @rtnads/llm-claude — the Claude adapter behind the model-agnostic boundary
 * (ADR-0003). Implements `@rtnads/llm-core`'s `LlmProvider` over Anthropic's
 * Messages API. Dependency-free `fetch` client; credentials live only here.
 *
 * The core platform never imports this package — the orchestrator depends on the
 * `llm-core` interface and the composition root wires a provider by config.
 */
export * from "./claude.js";
export * from "./factory.js";
