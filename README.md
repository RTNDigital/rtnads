# RTN Ads Intelligence

An AI-assisted advertising **management and optimization platform** for RTN House.

RTN Ads Intelligence turns RTN House's historical advertising experience — across
many clients, industries, countries and campaigns — into a reusable **decision
intelligence layer**. It compares active campaigns with historically similar RTN
campaigns, surfaces anomalies and opportunities, recommends optimization actions,
executes approved actions, and learns from their outcomes.

This is **not** a generic AI advertising assistant. It is an *agency-specific*
advertising intelligence system.

> **Status: M0 complete · M1 complete · M2 (cohorts & benchmarks) in progress.**
> The architecture specification in [`docs/`](./docs) is complete and remains the
> source of truth. Foundations, the analytics stack and the first MCP domain are
> in; M2 has added the deterministic Benchmark Engine and its cohort/anomaly MCP
> tools. See [docs/13-mvp-milestones.md](./docs/13-mvp-milestones.md).

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
| CRM connector read-path (L1) | [`services/connectors-crm`](./services/connectors-crm) | Fixture → **pseudonymize (PII dropped)** → validated `NormalizedCrmSync` → loader (`crm.lead/funnel_event/sale`) |
| Deterministic analytics (L3) | [`services/analytics-engine`](./services/analytics-engine) | pure metrics, funnel & unit economics + `Pg`/in-memory repos; **no LLM** |
| Deterministic benchmarking (L3) | [`services/benchmark-engine`](./services/benchmark-engine) | influence-weighted cohorts, weighted benchmarks, robust anomaly detection; **no LLM** |
| Ads Analytics MCP (L4) | [`mcp-servers/ads-analytics-mcp`](./mcp-servers/ads-analytics-mcp) | read-only MCP tools over both engines (metrics, unit economics, **cohorts, anomalies**); capability-gated; **thin adapter, no logic** |

Everything above is verified: `pnpm test` (70 unit/property/round-trip tests) plus
end-to-end DB checks in [CI](./.github/workflows/ci.yml) — cross-tenant RLS
isolation; the Meta read-path into normalized `core`/`facts`; the CRM read-path
with a **PII-leak scan** (no name/email/phone reaches the analytical store); the
Analytics Engine computing correct numbers — including **CRM-driven funnel
economics** — straight off the loaded warehouse; and a **full-stack MCP round-trip**
(client → server → engine → Postgres) returning those numbers. All loads are
idempotent on replay.

**M0 — Foundations** is complete. **M1 — Analytics & context** is well underway:
the Analytics Engine deterministically computes totals, derived metrics, the
Health Tourism funnel, and business-specific unit economics — with real CRM
outcomes now feeding *cost per qualified lead* (£26.28), *cost per booking*
(£52.55), *CAC* (£105.10) and *revenue per lead* (£500) for the sample campaign,
not CPL alone. The first MCP domain — **Ads Analytics MCP** — now exposes these as
read-only, capability-gated tools, realizing the core boundary: the AI reaches
analytics *only* through MCP and never computes a number itself. PII never leaves
L1.

**M2 — Cohorts & benchmarks** is underway: the Benchmark Engine builds
influence-weighted cohorts of historically similar RTN campaigns
(`influence = f(similarity)·g(recency)·h(sample)·q(quality)` — stale data does not
count the same as recent), benchmarks a subject against them (weighted
percentiles + direction-aware assessment), and flags anomalies with a robust
median/MAD z-score. These surface as three more MCP tools —
`find_similar_campaigns`, `compare_with_cohort`, `detect_anomalies`. Empty cohorts
and flat series yield explicit "insufficient evidence", never fabricated numbers.

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
