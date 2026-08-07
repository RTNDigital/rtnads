# 06 — API Boundaries

This document defines the contracts *between* components: external ingress, the
internal service APIs, the MCP boundary (cross-ref [05](./05-mcp-tool-contracts.md)),
and how contracts are shared and versioned.

## 1. Boundary map

```
        External clients (RTN operators' UI)
                    │  HTTPS + session auth
                    ▼
        ┌───────────────────────────┐
        │   BFF / Public API (REST)  │   tenancy + RBAC enforced here
        └───┬───────────────┬────────┘
            │ internal RPC   │ internal RPC
   ┌────────▼──────┐  ┌──────▼────────┐   ┌───────────────┐
   │ Query Service │  │ Control API   │   │ Orchestrator  │
   │ (read models) │  │ (approvals,   │   │ Service (L5)  │
   └──────┬────────┘  │  actions)     │   └──────┬────────┘
          │           └──────┬────────┘          │ MCP (typed tools/resources)
          ▼                  ▼                    ▼
   Analytics/Benchmark   Policy Engine +     Ads Analytics / Knowledge /
   /Decision (L3)        Action Executor(L6) CRM / Ads Actions MCP servers
          │                  │                    │
          ▼                  ▼                    ▼
              Normalized Data Warehouse (L2)  ·  Connectors (L1)
                    │                                │
                    ▼                                ▼
               (raw landing)                Advertising & CRM platforms
```

Three boundary classes:
- **External (ingress):** REST/JSON over HTTPS to the BFF. Human users only.
- **Internal service-to-service:** typed RPC (gRPC or typed HTTP + shared Zod).
- **MCP:** the orchestrator ↔ MCP servers (see [05](./05-mcp-tool-contracts.md)).

## 2. External API (BFF / Public API)

Purpose: serve the operator UI. **All tenancy and RBAC checks happen here** before
any internal call. No connector credentials or PII cross this boundary.

Representative resources (REST):

```
GET  /v1/clients/{clientId}/accounts
GET  /v1/accounts/{accountId}/snapshot?window=...
GET  /v1/campaigns/{campaignId}/performance?window=...&granularity=day
GET  /v1/campaigns/{campaignId}/cohort            -> similar campaigns + benchmark
GET  /v1/accounts/{accountId}/anomalies
GET  /v1/recommendations?clientId=...&status=pending
GET  /v1/recommendations/{id}                     -> full Recommendation object
POST /v1/recommendations/{id}/approve             -> body: { note }
POST /v1/recommendations/{id}/reject              -> body: { reason }
GET  /v1/actions/{id}                             -> action + record + outcome
GET  /v1/actions/{id}/audit                       -> audit chain
GET  /v1/audit?clientId=...&subject=...
```

Rules:
- Every request resolves a **session principal** → `client_id` scope. Cross-tenant
  access is impossible by construction (scope is derived, never client-supplied).
- Read endpoints proxy the **Query Service** (materialized read models); they do
  not call engines synchronously for heavy work.
- Approve/reject endpoints call the **Control API**; they never call platforms.

## 3. Internal service APIs

Each service exposes a narrow, typed API. Contracts are Zod schemas in a shared
`contracts` package (see [12](./12-repository-structure.md)); breaking changes are
versioned.

### 3.1 Analytics Engine API (deterministic)
```
computeEntityMetrics(client_id, entity, window, metrics) -> MetricSeries
computeUnitEconomics(client_id, entity, window, model)   -> UnitEconomics
computeFunnel(client_id, scope, window, vertical_model)  -> Funnel
computeBudgetEfficiency(client_id, scope, window)        -> EfficiencyFrontier
```
Pure functions of warehouse state → **reproducible**. No writes except cached
read-models.

### 3.2 Benchmark Engine API (deterministic)
```
buildCohort(client_id, subject, attributes, weighting) -> Cohort
compareWithCohort(cohort_id, subject, metrics)         -> CohortComparison
detectAnomalies(client_id, scope, window, sensitivity) -> Anomaly[]
```
Persists `intel.cohort`, `intel.cohort_member`, `intel.benchmark_result` for
audit; results are deterministic given inputs + warehouse snapshot.

### 3.3 Decision Engine API (deterministic)
```
generateCandidates(client_id, entity, context) -> RecommendationDraft[]
scoreConfidence(draft, evidence)                -> ConfidenceDetail
```
Applies `knowledge.rule` + benchmark signals to produce **candidate**
recommendations with confidence/risk. Contains no LLM. The AI narrative is added
by the Orchestrator (§3.5).

### 3.4 Knowledge Service API (read)
```
resolvePlaybook(scope)      -> Playbook + rules
listBenchmarks(scope, metrics) -> Benchmark[]
getOptimizationPolicy(client_id) -> OptimizationPolicy
readResource(uri)           -> ResourceContent
```

### 3.5 Orchestrator Service API (L5)
```
draftRecommendation(candidate, evidence_bundle) -> Recommendation  // adds narrative
explain(recommendation)                          -> narrative
```
Talks to MCP servers, not to the warehouse. Uses the **LLM Provider Abstraction**
(model-agnostic). Never receives credentials/PII. Cannot write numbers into a
recommendation (validation strips/blocks unsupported numerics).

### 3.6 Control API + Policy Engine + Action Executor (L6)
```
evaluatePolicy(recommendation | proposed_change, context) -> PolicyEvaluation   // deterministic
submitForApproval(recommendation) -> Action(status=pending_approval)
approve(action_id, principal) / reject(action_id, principal)
executeAction(action_id)      -> ActionRecord   // captures pre/post state, rollback ref
evaluateOutcome(action_record_id, window) -> OutcomeEvaluation
rollback(action_record_id)    -> ActionRecord   // where platform permits
```
`evaluatePolicy` is the **only** authority for allow/deny. `executeAction` is the
**only** path that calls a platform mutation, always through a connector, always
recording an immutable `control.action_record`.

### 3.7 Connector API (L1)
```
pullAccounts / pullCampaigns / pullInsights(window)   // read
applyMutation(typed_change) -> platform_response      // write, called ONLY by Action Executor
```
Connectors are the **only** components holding platform credentials. They expose
normalized, typed shapes; platform quirks stop here.

## 4. Contract sharing & typing

- **One source of truth:** every boundary payload is a Zod schema in
  `packages/contracts`. From it we generate TypeScript types and JSON Schema.
- MCP tool schemas (05) are the same Zod schemas, re-exported to the MCP servers
  and the orchestrator client — no drift between "what the tool accepts" and "what
  the service accepts."
- **Versioning:** additive changes are backward-compatible; breaking changes bump
  a version segment (`/v1` → `/v2`, or `tool@2`). Consumers pin versions.

## 5. Boundary invariants (enforced, not aspirational)

1. **Credentials cross only L1↔platform.** No credential appears above the
   connector boundary; the BFF, engines, MCP servers and orchestrator never see
   them.
2. **PII crosses only L1↔CRM.** Above the CRM connector, only pseudonymous ids and
   computed bands exist.
3. **The LLM boundary is MCP-only.** The orchestrator reaches backend capability
   *exclusively* through MCP; it has no database or connector access.
4. **Mutations cross only Executor↔platform, post-policy.** No other component may
   call a platform write.
5. **Tenancy is derived, never supplied.** `client_id` comes from the session
   principal; request bodies cannot assert a different tenant.
6. **Reads are reproducible; writes are recorded.** Engine reads are pure; every
   write yields an immutable record + audit entry.
