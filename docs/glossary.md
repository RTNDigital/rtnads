# Glossary

Shared vocabulary for RTN Ads Intelligence. Terms are used consistently across all
documents.

| Term | Definition |
|------|------------|
| **Action** | An approved, policy-passed mutation submitted for execution against an advertising platform. |
| **Action Executor** | The only service that performs a platform mutation; captures pre/post state and supports rollback. |
| **Action Record** | Immutable record of an executed action (pre-state, executed change, post-state, timestamps, result). |
| **Action → Outcome dataset** | The accumulating record of recommendations, actions and their measured outcomes — RTN's proprietary learning asset. |
| **AdSet** | Canonical term for the targeting/budget unit below a campaign (Meta "ad set" = Google "ad group"). |
| **AI Orchestrator** | The model-agnostic L5 service that reasons over MCP tools and authors recommendation narratives. It never computes numbers or executes actions. |
| **Analytics Engine** | Deterministic L3 service computing metrics, unit economics and funnels. |
| **Audit entry** | Append-only, hash-chained record of a consequential event. |
| **Benchmark Engine** | Deterministic L3 service that builds cohorts, computes benchmarks, and detects anomalies. |
| **BFF** | Backend-for-Frontend; the ingress REST API serving the operator UI and enforcing tenancy + RBAC. |
| **Cohort** | A set of historically comparable RTN campaigns selected for benchmarking a subject. |
| **Context vector** | The set of context-dimension classifications attached to an advertising entity. |
| **Context dimension** | A registered classification axis (platform, market, funnel stage, creative angle, …); extensible as data. |
| **Correlation vs causation** | The discipline of treating historical outcomes as *evidence*, never automatic proof that a past action caused a change. |
| **CRM MCP** | Read-only MCP domain exposing anonymized lead-quality and sales-outcome data. |
| **Decision Engine** | Deterministic L3 service producing candidate recommendations with confidence/risk. |
| **Decision Memory** | The store of recommendations, approvals/rejections, actions and outcomes (in `control.*`). |
| **Determinism boundary** | The rule that all numeric computation happens in deterministic services (L1–L3, L6), never in the LLM (L5). |
| **Evidence window** | The date range of data underpinning a recommendation. |
| **Funnel** | The per-vertical ordered outcome stages (e.g. Health Tourism: Ad→Lead→…→Sale→Revenue). |
| **Historical Performance Memory** | Normalized advertising + CRM performance facts (warehouse). |
| **Influence** | A historical observation's weight in a benchmark: f(similarity)·g(recency)·h(sample)·q(quality). |
| **LLM Provider Abstraction** | The interface (`llm-core`) that keeps the platform model-agnostic. |
| **MCP** | Model Context Protocol; the typed integration boundary between the orchestrator and backend capabilities. |
| **Normalized Data Warehouse** | The L2 canonical store of entities, facts, taxonomy, context and pseudonymized CRM. |
| **Observation period** | The recommended wait before judging an action's outcome. |
| **Optimization Policy** | Client-scoped, versioned policy data enforced by the Policy Engine. |
| **Outcome evaluation** | Deterministic comparison of before/after metrics after the observation window, with a conservative causal confidence. |
| **Playbook** | RTN House strategy/domain knowledge for a scope (vertical/subcategory/platform/market). |
| **Policy Engine** | Deterministic L6 gate; the sole allow/deny authority for mutations; unbypassable by the AI. |
| **Pseudonym id** | Opaque, stable identifier replacing PII at the L1 boundary; mapping held in a separate PII vault. |
| **Recommendation** | Structured proposal (type, entity, action, reasoning, metrics, benchmark, confidence, risk, expected outcome, windows). |
| **RTN Knowledge MCP** | Read-only MCP domain exposing Strategy Memory as resources and lookups. |
| **Strategy Memory** | RTN House playbooks, rules, benchmarks and domain knowledge (`knowledge.*`). |
| **Taxonomy node** | A node in the extensible industry tree (vertical → subcategory → …), stored as data. |
| **Tenancy** | Isolation by `client_id`, derived from the session and enforced by RLS + MCP re-validation. |
| **Unit economics** | Cost/value metrics along the funnel (CPL, cost per qualified lead, CAC, ROAS, revenue per lead, margin). |
