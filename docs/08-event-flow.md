# 08 — Event Flow

The system is event-driven. This document defines the event families, their
payloads, and the end-to-end flows from ingestion through learning. Events are
durable, ordered per aggregate, and carry `client_id` for tenancy and a
`correlation_id` for tracing ([15](./15-observability-strategy.md)).

## 1. Event envelope

```jsonc
{
  "event_id": "uuid",
  "type": "ingest.sync.completed",
  "occurred_at": "2026-08-07T10:00:00Z",
  "client_id": "uuid",
  "correlation_id": "uuid",         // ties a whole workflow together
  "causation_id": "uuid|null",      // the event that caused this one
  "actor": { "kind": "system|user|llm", "id": "…" },
  "payload": { /* type-specific */ },
  "schema_version": 1
}
```

## 2. Event families

| Prefix | Family | Examples |
|--------|--------|----------|
| `ingest.*` | Ingestion | `sync.started`, `sync.completed`, `raw.landed` |
| `warehouse.*` | Normalization | `entity.upserted`, `facts.updated`, `classification.assigned` |
| `intel.*` | Intelligence | `cohort.built`, `benchmark.computed`, `anomaly.detected`, `recommendation.drafted` |
| `decision.*` | Human loop | `recommendation.published`, `approval.granted`, `approval.rejected` |
| `action.*` | Execution | `policy.evaluated`, `action.queued`, `action.executed`, `action.rolled_back` |
| `outcome.*` | Learning | `outcome.window.opened`, `outcome.evaluated`, `learning.updated` |
| `audit.*` | Audit | `audit.appended` (mirror of consequential events) |

## 3. Master flow (happy path)

```mermaid
sequenceDiagram
  autonumber
  participant SCH as Ingestion Scheduler
  participant CON as Connectors (L1)
  participant WH as Normalizer/Warehouse (L2)
  participant AN as Analytics/Benchmark (L3)
  participant DE as Decision Engine (L3)
  participant OR as AI Orchestrator (L5)
  participant PO as Policy Engine (L6)
  participant AP as Approval (human)
  participant EX as Action Executor (L6)
  participant OE as Outcome Eval (L6)

  SCH->>CON: sync window (ads + CRM)
  CON->>WH: raw.landed
  WH->>WH: normalize -> facts.updated, classification.assigned
  WH-->>AN: warehouse.facts.updated
  AN->>AN: metrics, cohorts, benchmarks
  AN->>AN: anomaly.detected
  AN-->>DE: benchmark.computed / anomaly.detected
  DE->>DE: generate candidates + confidence  (deterministic)
  DE-->>OR: recommendation.drafted (candidate, evidence bundle)
  OR->>OR: reason via MCP, author narrative
  OR-->>AP: recommendation.published (structured Recommendation)
  AP->>PO: approve request
  PO->>PO: evaluatePolicy (deterministic)  -> policy.evaluated
  alt allowed & approved
    PO-->>EX: action.queued
    EX->>EX: capture pre_state; applyMutation via connector
    EX-->>OE: action.executed (immutable action_record)
    Note over OE: wait recommended_observation_period
    OE->>OE: outcome.window.opened -> outcome.evaluated
    OE-->>DE: learning.updated (calibration / rule tuning)
  else denied by policy
    PO-->>AP: action rejected_by_policy (reasoned)
  end
```

Every arrow that changes state also emits an `audit.appended` mirror.

## 4. Flow A — Ingestion & normalization

```
Scheduler → ingest.sync.started
Connector → raw payloads → ingest.raw.landed (idempotent, checksummed)
Normalizer:
  upsert core.* → warehouse.entity.upserted
  load facts.* → warehouse.facts.updated
  compute data_quality
Classifier:
  assign context (rule/AI) → warehouse.classification.assigned
Scheduler → ingest.sync.completed { stats }
```
Replay: re-emitting from `ingest.raw_payload` reproduces identical `facts.*` (used
by tests and recovery).

## 5. Flow B — Analysis & recommendation

```
warehouse.facts.updated triggers:
  Analytics → metrics/unit-economics (read-models)
  Benchmark → cohort.built, benchmark.computed, anomaly.detected
  Decision → recommendation.drafted   (candidate + confidence + risk, deterministic)
Orchestrator (on recommendation.drafted):
  pulls evidence via MCP (Analytics/Knowledge/CRM)
  authors reasoning; attaches model_provenance
  → recommendation.published   (status = pending)
```
Numbers travel in the event payload from L3; the Orchestrator adds only narrative.

## 6. Flow C — Approval & policy

```
User approves (BFF → Control) → decision.approval.granted
Policy Engine.evaluatePolicy(recommendation, context):
  checks budget deltas, spend/conv minimums, cooldowns, maturity, client perms,
  experiment protection, daily spend limits, account restrictions
  → action.policy.evaluated { decision, violated_constraints }
if allow → action.queued ; if deny → recommendation returned with reasons
```
Approval never bypasses policy; policy is evaluated **after** human approval and
its `deny` is final regardless of approval.

## 7. Flow D — Execution & rollback

```
Executor (on action.queued):
  capture pre_state (fresh read) → immutable
  applyMutation via connector (idempotency_key)
  capture platform_response, post_state (initial)
  write control.action_record → action.executed
On failure or guardrail breach:
  Executor rollback (where platform permits) → action.rolled_back
```

## 8. Flow E — Outcome & learning

```
On action.executed → schedule outcome.window.opened at t + observation_period
At window close:
  Outcome Eval compares metrics_before vs metrics_after (deterministic)
  computes delta, result, causal_confidence
  → outcome.evaluated  (immutable control.outcome_evaluation)
Learning:
  aggregate Action→Outcome dataset
  → learning.updated  (confidence calibration, rule/weight suggestions to Strategy Memory)
```
Learning updates are **suggestions to Strategy Memory**, reviewed before they
change behavior (keeps the human-in-the-loop posture and avoids feedback runaways).

## 9. Ordering, delivery & idempotency

- **Per-aggregate ordering** (per account/campaign) via partition keys.
- **At-least-once delivery**; all consumers are idempotent (`event_id` dedupe;
  mutations carry `idempotency_key`).
- **Causation chain** (`causation_id`) lets any recommendation/action be traced
  back to the exact ingest run and facts that produced it — essential for audit
  and for the correlation-vs-causation discipline.

## 10. Backpressure & failure

- Ingestion and analysis are decoupled by the queue; slow analysis never blocks
  ingestion.
- Dead-letter queues capture poison events with full envelope for inspection.
- Outcome-window timers survive restarts (persisted schedule), so learning is
  never silently dropped.
