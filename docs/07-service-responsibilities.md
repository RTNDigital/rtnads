# 07 — Service Responsibilities

Each service has a **single responsibility** and an explicit dependency set.
"Owns" = the only writer of that data/decision. Nothing else may perform that
responsibility.

## Responsibility matrix

| Service | Layer | Single responsibility | Owns (writes) | Reads | Must NOT |
|---------|-------|----------------------|---------------|-------|----------|
| **Platform Connectors** | L1 | Normalize platform reads/writes; hold credentials | `ingest.raw_payload` (ads); platform mutations | platform APIs | compute analytics; expose credentials upward |
| **CRM Connectors** | L1 | Ingest CRM leads/sales; pseudonymize PII at boundary | `ingest.raw_payload` (crm) | CRM APIs | let PII pass upstream |
| **Ingestion Scheduler** | L1 | Schedule & orchestrate syncs/backfills | `ingest.sync_run` | connectors | transform business data |
| **Normalizer / Warehouse Loader** | L2 | Map raw → canonical entities & facts | `core.*`, `facts.*`, `crm.*`, `taxonomy.classification(source=ingested)` | `ingest.*` | make optimization decisions |
| **Classifier** | L2/L3 | Assign context classifications (rule/AI-assisted) | `taxonomy.classification(source=rule/ai)`, `taxonomy.creative_attribute` | facts, knowledge | execute actions |
| **Analytics Engine** | L3 | Deterministic metrics, unit economics, funnels | read-models / caches | `facts.*`, `crm.*`, `core.*` | build cohorts; call LLM |
| **Benchmark Engine** | L3 | Cohorts, similarity, benchmarks, anomalies | `intel.cohort*`, `intel.benchmark_result`, `intel.anomaly` | facts, classifications, knowledge | draft narratives; call LLM |
| **Decision Engine** | L3 | Rule+benchmark → candidate recs, confidence/risk | `intel.recommendation(draft)` | benchmark results, knowledge rules | write narrative; execute; call LLM |
| **Knowledge Service** | — | Serve Strategy Memory (playbooks/benchmarks/policies) | `knowledge.*` (curation) | `knowledge.*` | compute ads analytics |
| **Ads Analytics MCP** | L4 | Adapt L3/L2 reads to typed tools | — (stateless) | Analytics/Benchmark/Decision APIs | contain business logic |
| **RTN Knowledge MCP** | L4 | Adapt Knowledge to resources/tools | — | Knowledge Service | mutate anything |
| **CRM MCP** | L4 | Adapt anonymized CRM to typed tools | — | CRM/Analytics APIs | expose PII |
| **Ads Actions MCP** | L4 | Adapt mutation *requests* to typed tools | — | Control API (submit) | execute; bypass policy |
| **AI Orchestrator** | L5 | Reason, select tools, draft narrative & explanation | `intel.recommendation(narrative)` via Control | MCP tools only | compute numbers; see creds/PII; touch DB |
| **Policy Engine** | L6 | Deterministic allow/deny of every mutation | `control.policy_evaluation` | knowledge policies, action history, facts | be bypassable; call LLM |
| **Approval Workflow** | L6 | Human review queue; approve/reject | `control.approval`, `control.action(status)` | recommendations, policy evals | execute platform changes |
| **Action Executor** | L6 | Execute approved+passed actions; rollback | `control.action_record`, `control.outcome_evaluation` | connectors (write), facts | act without policy pass or approval |
| **Audit Service** | L6 | Append-only hash-chained audit | `control.audit_entry` | all write events | delete/mutate entries |
| **Query Service / BFF** | ingress | Serve UI read models; enforce tenancy+RBAC | read-model caches | Query APIs, Control API | call platforms; bypass RBAC |
| **IAM Service** | — | Identity, tenancy, roles/permissions | `iam.*` | — | grant capability beyond policy |

## Narrative responsibilities

### Connectors (L1)
The **only** holders of platform/CRM credentials. Read paths land raw payloads
(idempotent, replayable). The ads connector's write path (`applyMutation`) is
callable **only** by the Action Executor. CRM connectors pseudonymize before
anything leaves L1.

### Normalizer & Classifier (L2)
Normalizer maps heterogeneous platform payloads into canonical `core`/`facts` and
computes `data_quality`. Classifier attaches the **context vector**
([02 §4](./02-domain-model.md)), tagging each classification with `source` and
`confidence` so human > rule > AI precedence and auditability hold.

### The math layer (L3) — Analytics, Benchmark, Decision
The heart of the "deterministic math" principle. Given a warehouse snapshot these
services are **pure and reproducible**. They never call an LLM. The Decision
Engine emits *candidate* recommendations with deterministic confidence/risk; it
stops short of prose.

### AI Orchestrator (L5)
Reasons over evidence bundles obtained via MCP, selects which analyses to run,
and authors the **narrative** (`reasoning`, `explanation`) of a recommendation. It
may *propose* an action but cannot approve, execute, or compute numbers. It is the
only LLM-touching service and is behind a provider abstraction.

### Control plane (L6) — Policy, Approval, Executor, Audit
- **Policy Engine** is the deterministic gate; its `evaluatePolicy` is the sole
  allow/deny authority ([11](./11-optimization-workflow.md),
  [10](./10-permission-model.md)).
- **Approval Workflow** manages human-in-the-loop.
- **Action Executor** is the sole component that performs a platform mutation,
  always capturing an immutable `action_record` and (later) an
  `outcome_evaluation`.
- **Audit Service** appends a hash-chained entry for every consequential event.

## Dependency direction rule

Dependencies point **downward and inward** (ingress → engines → warehouse;
orchestrator → MCP → services). No upward calls: engines never call the
orchestrator; connectors never call engines; MCP servers never call each other.
This keeps the determinism boundary and audit trail intact.
