# 01 — System Architecture

## 1. Architectural style

RTN Ads Intelligence is a **modular, layered, event-driven** system. Each layer
has a single responsibility and communicates through **strongly typed, versioned
contracts**. The layering enforces the core principle: *deterministic services do
all math; the LLM only reasons and orchestrates.*

The system is delivered as a **monorepo of independently deployable services and
shared typed packages** (see [12-repository-structure](./12-repository-structure.md)).

## 2. The pipeline, in layers

```
                         ┌───────────────────────────────────────────┐
                         │            Advertising Platforms            │
                         │   (Meta, Google, TikTok, …) + CRM systems   │
                         └───────────────┬───────────────┬────────────┘
                                         │ read          │ write (mutations)
                                         ▼               ▲
┌────────────────────────────────────────────────────────────────────────────┐
│ L1  INGESTION                                                                │
│   Platform Connectors  ·  CRM Connectors  ·  Scheduler  ·  Raw landing zone  │
└───────────────────────────────┬────────────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ L2  NORMALIZED DATA WAREHOUSE                                                │
│   Canonical entities · fact tables · taxonomy · context dimensions ·         │
│   pseudonymized CRM · data-quality metadata                                  │
└───────────────────────────────┬────────────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ L3  DETERMINISTIC INTELLIGENCE (no LLM)                                      │
│   Analytics Engine → Benchmark Engine → Decision Engine                      │
│   (aggregation, cohort selection, similarity, anomaly detection, scoring)    │
└───────────────────────────────┬────────────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ L4  MCP CAPABILITY BOUNDARY                                                  │
│   Ads Analytics MCP · RTN Knowledge MCP · CRM MCP · Ads Actions MCP          │
│   (thin adapters exposing L3/L2/L6 capabilities as typed tools/resources)    │
└───────────────────────────────┬────────────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ L5  AI ORCHESTRATOR  (model-agnostic)                                        │
│   Reasoning · tool selection · recommendation drafting · explanation         │
│   LLM Provider Abstraction (Claude / others) — never sees credentials/PII    │
└───────────────────────────────┬────────────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ L6  CONTROL PLANE                                                            │
│   Policy Engine (deterministic gate) · Approval Workflow · Action Executor   │
│   · Rollback · Decision Memory / Audit                                       │
└───────────────────────────────┬────────────────────────────────────────────┘
                                 ▼
                         (mutations flow back to platforms, gated)
```

**Key rule:** L5 (the LLM) can *read* through L4 and can *propose* actions, but
every proposed mutation must traverse L6's Policy Engine before the Action
Executor calls a platform. L4's Ads Actions MCP never executes directly.

## 3. Components

### L1 — Ingestion
- **Platform Connectors** — one adapter per advertising platform. Pull accounts,
  campaigns, ad sets, ads, creatives, insights. Normalize auth, pagination, rate
  limits, retries. Credentials live here and in the secrets vault only.
- **CRM Connectors** — pull leads and sales outcomes; pseudonymize PII at the
  boundary (see [09-security-model](./09-security-model.md)).
- **Ingestion Scheduler** — orchestrates periodic and backfill syncs.
- **Raw Landing Zone** — immutable raw payloads for replay and lineage.

### L2 — Normalized Data Warehouse
- Canonical entity tables (account, campaign, ad set, ad, creative).
- Time-series fact tables (spend, impressions, clicks, conversions, funnel
  events, revenue).
- **Taxonomy** and **Context Dimension** stores (extensible without schema
  changes — see [03](./03-database-model.md)).
- Pseudonymized CRM facts.
- Data-quality metadata (freshness, completeness, sample size).

### L3 — Deterministic Intelligence (the math layer, no LLM)
- **Analytics Engine** — deterministic aggregation, unit economics, funnel
  computation, trend and efficiency metrics.
- **Benchmark Engine** — builds cohorts of comparable campaigns; computes
  distributions and percentile benchmarks; applies similarity/recency/sample/
  quality weighting; runs anomaly detection.
- **Decision Engine** — turns benchmarked signals + Strategy Memory rules into
  candidate recommendations with confidence, risk, evidence window and expected
  outcome. Produces structured proposals; contains no LLM.

### L4 — MCP capability boundary
Four MCP domains expose L2/L3/L6 capabilities as typed tools and resources. MCP
servers are **thin adapters** — no business logic lives in them (see
[04-mcp-architecture](./04-mcp-architecture.md)).

### L5 — AI Orchestrator
- Selects and calls MCP tools, assembles evidence, drafts human-readable
  recommendations and explanations, and distinguishes correlation from causation
  in its narrative.
- Sits behind an **LLM Provider Abstraction** so Claude or any other provider can
  be swapped. Never receives platform credentials or raw PII.

### L6 — Control plane
- **Policy Engine** — deterministic; enforces all constraints; the only path to a
  mutation.
- **Approval Workflow** — human review, approve/reject, prepared-action queue.
- **Action Executor** — performs approved, policy-passed mutations via connectors;
  captures before/after state; supports rollback where the platform permits.
- **Decision Memory / Audit** — immutable recommendation and action records.

## 4. The three memories mapped to components

| Memory | Backed by | Exposed via |
|--------|-----------|-------------|
| Historical Performance Memory | L2 warehouse (ads + CRM facts) | Ads Analytics MCP, CRM MCP |
| Strategy Memory | Playbook/benchmark/rule store | RTN Knowledge MCP |
| Decision Memory | L6 audit store (recs, actions, outcomes) | internal API + Ads Analytics MCP (read-back) |

## 5. Technology choices (recommended, not final)

Chosen for strong typing, MCP maturity, and operational simplicity. Alternatives
are captured as ADRs.

| Concern | Recommendation | Rationale |
|---------|----------------|-----------|
| Language (services & MCP) | **TypeScript / Node.js** | First-class MCP SDK; one language across services and typed contracts; Zod for runtime validation. |
| Heavy analytics jobs | TypeScript workers; **optionally Python** for statistics-heavy jobs behind the same contracts | Keep the *option* open without coupling the core to Python. |
| Primary datastore | **PostgreSQL** | Relational integrity for entities + funnels; JSONB for extensible context; window functions for benchmarks. |
| Vector similarity (creative) | **pgvector** (same Postgres) | Attribute cohorts are deterministic SQL; embeddings only for creative similarity — no separate vector DB at MVP. |
| Async / eventing | **Durable queue (e.g. BullMQ/Redis at MVP; broker later)** | Decouple ingestion, analysis, action; enable replay. |
| Contract validation | **Zod + TypeScript types + JSON Schema** | Single source of truth for MCP tool contracts and API bodies. |
| LLM access | **Provider abstraction** over MCP | Model-agnostic; Claude first, others pluggable. |
| Secrets | **Dedicated vault / KMS** | Credentials isolated from LLM and app tier. |

See [ADR-0001](./adr/0001-language-and-runtime.md), [ADR-0002](./adr/0002-datastore.md),
[ADR-0003](./adr/0003-model-agnostic-llm-boundary.md).

## 6. Determinism boundary (the single most important invariant)

```
        can compute numbers            can NOT compute numbers
        ┌───────────────────┐          ┌───────────────────────┐
        │ L1 · L2 · L3 · L6 │          │ L5 AI Orchestrator     │
        │ (deterministic)   │  ──MCP──▶ │ (reasoning only)       │
        └───────────────────┘          └───────────────────────┘
```

If a number appears in a recommendation, it was computed in L3 (or read from L2)
and passed through L4 — never produced by the LLM. Tests enforce this (see
[14-testing-strategy](./14-testing-strategy.md)).

## 7. Multi-tenancy

Every row and every request is scoped by `client_id` (and `ad_account_id`).
Tenancy is enforced in L2 (row-level scoping), L4 (MCP calls carry an
authorization context), and L6 (policies are client- and account-specific). See
[09](./09-security-model.md) and [10](./10-permission-model.md).

## 8. Deployment topology (MVP)

- Stateless services (connectors, engines, MCP servers, orchestrator, control
  plane) as separate containers.
- One PostgreSQL primary (+ read replica later) with logical schemas per concern.
- One queue/broker.
- One secrets vault.
- Object storage for the raw landing zone.

Horizontal scaling is per service. Ingestion and analytics workers scale
independently of the interactive API.

## 9. Failure & consistency posture

- Ingestion is **idempotent and replayable** from the raw landing zone.
- Analytics/benchmark outputs are **reproducible** given a warehouse snapshot —
  same inputs, same numbers (enables regression tests and audit).
- Action execution is **transactional at the record level**: no action record
  without a captured pre-state; no execution without a passed policy evaluation.
- Everything that mutates a platform is **rollback-aware** where the platform
  permits.
