# ADR-0003 — Model-agnostic LLM boundary

**Status:** Proposed

## Context
The brief requires the core platform to remain **model-agnostic** — not tightly
coupled to Claude or any single LLM provider. At the same time, the LLM must reach
backend capabilities in a controlled, auditable way.

## Decision
Two layers keep the platform provider-independent:

1. **MCP as the capability boundary.** The AI reaches all backend capability
   *exclusively* through MCP tools/resources ([04](../04-mcp-architecture.md)).
   MCP is a standard the orchestrator speaks regardless of provider.
2. **`llm-core` provider interface.** The orchestrator depends only on a
   vendor-neutral interface (`providers/llm-core`) covering chat, tool-calling,
   streaming, token accounting and safety hooks. Concrete adapters
   (`llm-claude`, future `llm-<other>`) implement it. Selecting a provider is a
   **configuration** change.

Provenance (`provider/model/version`) is recorded on every recommendation
([03](../03-database-model.md), [15](../15-observability-strategy.md)), and
**provider-parity evals** ([14 §7](../14-testing-strategy.md)) run the same eval
set across ≥2 providers to keep the abstraction honest.

## Consequences
- Claude can be the first (and default) provider without the core depending on it.
- The determinism boundary is unaffected by provider choice — no provider computes
  numbers; all math stays in L3.
- Swapping/adding providers does not touch contracts, engines, policy, or MCP
  servers.

## Alternatives considered
- **Direct provider SDK in the orchestrator:** simplest short-term, but couples the
  core to one vendor — explicitly disallowed by the brief.
- **A third-party LLM gateway/abstraction library:** viable as an *implementation
  detail behind* `llm-core`, but the interface we depend on stays ours to avoid
  lock-in to the gateway.
