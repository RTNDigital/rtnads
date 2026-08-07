# ADR-0001 — Language & runtime: TypeScript/Node.js monorepo

**Status:** Proposed

## Context
The platform needs strongly typed contracts across many services and MCP servers,
a mature MCP SDK, and a single toolchain to keep boundaries consistent. Some
analytics work is statistics-heavy and could favor Python.

## Decision
Use **TypeScript on Node.js** as the primary language for all services, MCP
servers and shared packages, in a **pnpm monorepo**. Contracts are authored once
in Zod (`packages/contracts`) and code-generated to TS types + JSON Schema.

Keep an **escape hatch**: individual statistics-heavy jobs may be implemented in
Python *behind the same typed contracts* (invoked as isolated workers), without
the core depending on Python.

## Consequences
- One language for the determinism boundary, MCP, and the UI reduces drift and
  cognitive load; the MCP TypeScript SDK is first-class.
- Runtime validation (Zod) at every boundary complements compile-time types.
- If heavy numerical/statistical needs grow, Python workers are added at the edges
  without coupling the core — preserving modularity.

## Alternatives considered
- **Python-first:** great for stats/ML, weaker/newer for our end-to-end typed-
  contract + MCP-server story; would split the stack.
- **Go:** excellent for services, but a heavier fit for the LLM/MCP orchestration
  layer and shared-type ergonomics.
