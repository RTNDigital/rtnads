# 12 — Repository Structure

A **TypeScript monorepo** (pnpm workspaces + Turborepo-style task graph). Modular
packages with strongly typed contracts; each service is independently deployable
but shares generated types so contracts cannot drift.

## 1. Top-level layout

```
rtnads/
├─ README.md
├─ docs/                          # this specification set (source of truth pre-impl)
│  ├─ 00-overview.md … 15-observability-strategy.md
│  ├─ glossary.md
│  └─ adr/                        # Architecture Decision Records
├─ packages/                      # shared libraries (no deployable process)
│  ├─ contracts/                  # Zod schemas → TS types + JSON Schema (ONE source of truth)
│  ├─ domain/                     # domain types & pure helpers (taxonomy, context, funnel)
│  ├─ config/                     # typed config loading, env validation
│  ├─ telemetry/                  # logging/metrics/tracing helpers (OTel)
│  ├─ testkit/                    # fixtures, golden-file helpers, fakes
│  └─ mcp-kit/                    # shared MCP server/client scaffolding + auth context
├─ services/                      # deployable processes
│  ├─ connectors-ads/             # L1 platform connectors (credentials live here)
│  ├─ connectors-crm/             # L1 CRM connectors (+ pseudonymization)
│  ├─ ingestion-scheduler/        # L1 sync orchestration
│  ├─ warehouse/                  # L2 normalizer + loaders + migrations
│  ├─ classifier/                 # L2/L3 context & creative classification
│  ├─ analytics-engine/           # L3 deterministic metrics/unit economics
│  ├─ benchmark-engine/           # L3 cohorts/similarity/benchmarks/anomalies
│  ├─ decision-engine/            # L3 candidate recommendations + confidence
│  ├─ knowledge-service/          # Strategy Memory store & API
│  ├─ orchestrator/               # L5 AI orchestration (LLM provider abstraction)
│  ├─ policy-engine/              # L6 deterministic policy gate
│  ├─ control-api/                # L6 approvals, actions, audit orchestration
│  ├─ action-executor/            # L6 execution + rollback + outcome eval
│  ├─ bff/                        # ingress REST API for the operator UI
│  └─ web/                        # operator UI (later; thin at MVP)
├─ mcp-servers/                   # L4 thin MCP adapters (no business logic)
│  ├─ ads-analytics-mcp/
│  ├─ rtn-knowledge-mcp/
│  ├─ crm-mcp/
│  └─ ads-actions-mcp/
├─ providers/                     # pluggable LLM providers (model-agnostic)
│  ├─ llm-core/                   # provider interface + prompt/tool abstractions
│  ├─ llm-claude/                 # Claude adapter
│  └─ llm-<other>/                # future providers
├─ db/                            # SQL migrations, RLS policies, seed data
├─ ops/                           # IaC, deployment manifests, runbooks
├─ tools/                         # codegen (contracts→types/JSON Schema), lint, scripts
└─ tests/                         # cross-service integration & e2e suites
```

## 2. Package boundaries & the dependency rule

Dependencies point **inward/downward** ([07 §dependency rule](./07-service-responsibilities.md)).
Enforced by lint rules (`import/no-restricted-paths`) and package `exports`:

```
contracts, domain  ── depended on by ── everything
telemetry, config  ── depended on by ── all services & mcp-servers
mcp-kit            ── depended on by ── mcp-servers, orchestrator (client)
llm-core           ── depended on by ── orchestrator ; llm-<x> implement llm-core
services (L3)      ── never import ── orchestrator, mcp-servers, bff
mcp-servers        ── import ── contracts + a service's client; never each other
orchestrator       ── imports ── mcp-kit + llm-core ; NEVER db/connectors/engines directly
action-executor    ── the only ── caller of connectors' write path
```

Illustrative violations that CI must reject:
- `analytics-engine` importing `orchestrator` (upward) ❌
- `orchestrator` importing `warehouse` or `connectors-*` (bypasses MCP) ❌
- any `mcp-server` importing another `mcp-server` ❌
- anything but `action-executor` importing the connector write path ❌

## 3. The `contracts` package (single source of truth)

- Every boundary payload — MCP tool I/O ([05](./05-mcp-tool-contracts.md)),
  internal service APIs ([06](./06-api-boundaries.md)), events
  ([08](./08-event-flow.md)) — is a **Zod schema** here.
- `tools/codegen` emits TypeScript types + JSON Schema consumed by servers,
  clients, and the UI. There is exactly one definition per contract.
- Versioning lives here: `contracts/v1`, additive changes in place, breaking
  changes as new versioned exports.

## 4. Providers (`providers/`) — model-agnostic boundary

- `llm-core` defines the provider interface (chat/tool-call/streaming, token
  accounting, safety hooks) with **no vendor types**.
- `llm-claude` and any future `llm-<other>` implement it. The `orchestrator`
  depends only on `llm-core`; swapping providers is a config change
  ([ADR-0003](./adr/0003-model-agnostic-llm-boundary.md)).

## 5. Database (`db/`)

- Versioned SQL migrations per schema ([03](./03-database-model.md)), **RLS
  policies** as first-class migrations, and non-sensitive seed data (taxonomy
  nodes, dimension registry, funnel stage definitions).
- No ORM lock-in in contracts; services use a thin typed query layer.

## 6. Ownership (CODEOWNERS sketch)

| Path | Owner |
|------|-------|
| `packages/contracts`, `packages/domain` | Architecture |
| `services/connectors-*`, `db/` (crm), PII | Data/Security |
| `services/*-engine`, `classifier` | Intelligence |
| `mcp-servers/*`, `orchestrator`, `providers/*` | AI Platform |
| `policy-engine`, `control-api`, `action-executor` | Control/Safety |
| `bff`, `web` | Product |

## 7. Conventions

- Strict TypeScript (`strict: true`), no `any` at boundaries (Zod-validated).
- Each service ships: `README`, typed config schema, health/readiness endpoints,
  OpenTelemetry wiring ([15](./15-observability-strategy.md)), and a test suite.
- Everything crossing a boundary is validated at runtime, not just at compile
  time.
