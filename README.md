# RTN Ads Intelligence

An AI-assisted advertising **management and optimization platform** for RTN House.

RTN Ads Intelligence turns RTN House's historical advertising experience — across
many clients, industries, countries and campaigns — into a reusable **decision
intelligence layer**. It compares active campaigns with historically similar RTN
campaigns, surfaces anomalies and opportunities, recommends optimization actions,
executes approved actions, and learns from their outcomes.

This is **not** a generic AI advertising assistant. It is an *agency-specific*
advertising intelligence system.

> **Status: M0 complete · M1 (analytics & context) in progress.**
> The architecture specification in [`docs/`](./docs) is complete and remains the
> source of truth. M0 (foundations) is done; M1 has begun with the deterministic
> Analytics Engine. See [docs/13-mvp-milestones.md](./docs/13-mvp-milestones.md).

## Getting started

```bash
pnpm install
pnpm build          # build shared packages (contracts → domain)
pnpm typecheck      # strict TypeScript across the workspace
pnpm test           # unit + property tests (contracts, domain math)

# database (needs a reachable PostgreSQL)
export DATABASE_URL=postgres://user:pass@localhost:5432/rtnads
pnpm db:migrate     # apply schema + RLS
pnpm db:seed        # load taxonomy / dimension / funnel reference data
```

### What exists today (M0)

| Area | Location | State |
|------|----------|-------|
| Typed boundary contracts (Zod → TS) | [`packages/contracts`](./packages/contracts) | common, taxonomy, warehouse rows, recommendation, events, Ads Analytics MCP I/O + tests |
| Deterministic domain math | [`packages/domain`](./packages/domain) | similarity + influence weighting, taxonomy helpers + property tests |
| Database model + tenancy | [`db/`](./db) | migrations for `iam/core/facts/taxonomy/crm`, **RLS** (fail-closed), taxonomy seed |
| Ads connector read-path (L1) | [`services/connectors-ads`](./services/connectors-ads) | Meta fixture → pure mapper → validated `NormalizedSync` → warehouse loader (`core`/`facts`) |
| Deterministic analytics (L3) | [`services/analytics-engine`](./services/analytics-engine) | pure metrics, funnel & unit economics + `Pg`/in-memory repos; **no LLM** |

Everything above is verified: `pnpm test` (40 unit/property tests) plus end-to-end
DB checks in [CI](./.github/workflows/ci.yml) — cross-tenant RLS isolation; the
Meta read-path from fixtures into normalized `core`/`facts` (idempotent on
replay); and the Analytics Engine computing correct numbers straight off the
loaded warehouse.

**M0 — Foundations** is complete: a real account's data path flows `raw fixture →
normalized facts`, with taxonomy/dimensions extensible as data and tenancy
enforced at the database. **M1 — Analytics & context** has begun: the Analytics
Engine deterministically computes totals, derived metrics, the Health Tourism
funnel, and business-specific unit economics (cost per qualified lead, cost per
booking, CAC, revenue per lead — not CPL alone). Numbers are computed here, never
by an LLM.

---

## Core design commitments

1. **Deterministic math, probabilistic reasoning.** LLMs never perform raw
   analytics. All numerical computation — aggregation, benchmarking, cohort
   selection, anomaly detection, statistics — is performed by backend services.
   The LLM is the reasoning and orchestration layer only.
2. **Human-in-the-loop first.** Phase 1 is read-only analysis and
   recommendations. Phase 2 adds approval of prepared actions. Autonomous
   optimization is not implemented until enough Recommendation → Action → Result
   data exists to justify it.
3. **Model-agnostic core.** The platform is not coupled to Claude or any single
   LLM provider. The LLM sits behind a provider abstraction; MCP is the
   integration boundary.
4. **Everything is auditable.** Every recommendation and every executed action
   produces an immutable record with pre-state, reasoning, approval, executed
   change, and post-action outcome.
5. **Policy is deterministic and unbypassable.** A deterministic Policy Engine
   sits between the AI and every platform mutation. The AI cannot bypass it.
6. **Credentials never reach the LLM.** PII is separated from analytical data
   using internal pseudonymous identifiers.

---

## The optimization pipeline

```
Advertising APIs
   → Data Ingestion
      → Normalized Data Warehouse
         → Analytics Engine
            → Benchmark Engine
               → Decision Engine
                  → AI Orchestrator
                     → Policy Engine
                        → Action Executor
                           → Advertising APIs
```

Analytics, Benchmark and Decision engines are deterministic. The AI Orchestrator
reasons over their structured output via MCP. The Policy Engine gates every
mutation before the Action Executor touches a platform.

---

## Documentation index

The brief requires these specifications before implementation. Each lives in
[`docs/`](./docs):

| # | Document | Covers |
|---|----------|--------|
| 00 | [Overview](./docs/00-overview.md) | Vision, goals, scope, guiding principles, glossary pointer |
| 01 | [System Architecture](./docs/01-system-architecture.md) | Layered architecture, components, technology choices, deployment |
| 02 | [Domain Model](./docs/02-domain-model.md) | Entities, industry taxonomy, campaign context model, similarity model |
| 03 | [Database Model](./docs/03-database-model.md) | Schemas, tables, keys, extensible taxonomy & context storage, ERD |
| 04 | [MCP Architecture](./docs/04-mcp-architecture.md) | MCP domains, boundaries, what belongs (and doesn't) in MCP |
| 05 | [MCP Tool Contracts](./docs/05-mcp-tool-contracts.md) | Tool & resource JSON contracts for each MCP domain |
| 06 | [API Boundaries](./docs/06-api-boundaries.md) | Service-to-service contracts, external ingress, internal APIs |
| 07 | [Service Responsibilities](./docs/07-service-responsibilities.md) | Each service's single responsibility and dependencies |
| 08 | [Event Flow](./docs/08-event-flow.md) | Ingestion, analysis, recommendation, action and learning events |
| 09 | [Security Model](./docs/09-security-model.md) | Credential isolation, PII pseudonymization, tenancy, threat model |
| 10 | [Permission Model](./docs/10-permission-model.md) | Roles, client automation permissions, policy-scoped authority |
| 11 | [Optimization Workflow](./docs/11-optimization-workflow.md) | End-to-end loop from active campaign to learned outcome |
| 12 | [Repository Structure](./docs/12-repository-structure.md) | Monorepo layout, package boundaries, ownership |
| 13 | [MVP Milestones](./docs/13-mvp-milestones.md) | Phased delivery plan and acceptance criteria |
| 14 | [Testing Strategy](./docs/14-testing-strategy.md) | Test pyramid, determinism tests, policy tests, eval harness |
| 15 | [Observability Strategy](./docs/15-observability-strategy.md) | Logging, metrics, tracing, LLM/decision telemetry, audit |
|  — | [Glossary](./docs/glossary.md) | Shared vocabulary |
|  — | [ADRs](./docs/adr/) | Architecture Decision Records |

---

## How to read this

- Start with **[00-overview](./docs/00-overview.md)** for scope and principles.
- **[01-system-architecture](./docs/01-system-architecture.md)** is the map;
  every other document zooms into a region of it.
- Reviewers focused on data should read **02 → 03**.
- Reviewers focused on AI integration should read **04 → 05 → 11**.
- Reviewers focused on safety should read **09 → 10 → 11**.
