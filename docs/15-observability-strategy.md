# 15 — Observability Strategy

Observability must answer three questions at all times: *Is the system healthy?*,
*Why did it recommend/do this?* (decision transparency), and *Did the action
work?* (outcome tracking). It combines conventional telemetry with
**decision/LLM-specific** and **audit** observability.

## 1. Pillars

| Pillar | Standard | Purpose |
|--------|----------|---------|
| Logs | Structured JSON (OpenTelemetry) | Debugging, forensic trail |
| Metrics | OTel metrics / Prometheus-style | Health, SLOs, capacity |
| Traces | OTel tracing; `correlation_id`==trace | End-to-end flow visibility |
| Decision telemetry | Domain events + Decision Memory | *Why* a recommendation exists |
| LLM telemetry | Provider-agnostic spans | Cost, latency, grounding, provenance |
| Audit | Hash-chained `control.audit_entry` | Tamper-evident accountability |

Everything is correlated by the event `correlation_id`
([08](./08-event-flow.md)) so a single id links ingest → analysis →
recommendation → approval → action → outcome.

## 2. Structured logging

- One structured logger (`packages/telemetry`); every log carries `service`,
  `client_id`, `correlation_id`, `event_id`/`causation_id`, `actor_kind`.
- **Log redaction is mandatory:** a shared serializer strips credential and PII
  patterns before emit; CI asserts no secret/PII reaches logs
  ([09](./09-security-model.md), [14 §3](./14-testing-strategy.md)).
- Levels: `error` (actionable), `warn` (degraded), `info` (state transitions),
  `debug` (dev only). Business state transitions are `info` events, not ad-hoc
  strings.

## 3. Metrics (by layer)

**Ingestion:** sync success rate, freshness (hrs since last sync per account),
rows ingested, rate-limit hits, DLQ depth.

**Warehouse/quality:** facts completeness %, data-quality score distribution,
classification coverage (% entities with full context vector).

**Intelligence:** cohort build latency, cohort size / effective sample
distribution, % subjects with "insufficient evidence", anomalies/day, benchmark
query p95.

**Recommendations:** recommendations/day by type, confidence distribution, %
published vs suppressed, operator approval/reject rate, time-to-decision.

**Actions:** actions executed, policy `deny`/`needs_approval` rates + which
constraints fire, execution success/failure, rollback count, action latency.

**Outcomes (the money metric):** % actions evaluated, outcome result mix
(improved/neutral/regressed/inconclusive), realized delta distribution, causal-
confidence distribution.

**LLM:** tokens & cost per recommendation (per provider/model), latency,
tool-call counts, grounding-eval score trend, injection-eval pass rate.

**Platform SLOs:** interactive read p95, availability, queue lag.

## 4. Tracing

- A trace spans the full workflow; each service adds spans (connector fetch,
  normalize, cohort build, benchmark, decision, orchestrator reasoning, each MCP
  tool call, policy eval, execution, outcome eval).
- MCP tool calls are spans with tool name, input hash (not raw), duration, result
  status — so "which tools did the AI use to reach this recommendation" is
  answerable directly.
- LLM spans record provider/model/version, token usage, and latency — never prompt
  contents containing sensitive data (hash/redact).

## 5. Decision transparency (domain-specific observability)

Because a recommendation must be explainable and auditable, the system exposes a
**decision trace** per recommendation/action, reconstructable from persisted data:

```
Recommendation R
 ├─ evidence_window, supporting_metrics            (from Analytics, persisted)
 ├─ cohort_id → members + similarity + influence   (Benchmark, persisted)
 ├─ benchmark_result (percentile, distribution)    (Benchmark, persisted)
 ├─ anomalies cited                                (persisted)
 ├─ rules applied                                  (Decision Engine, persisted)
 ├─ narrative + model_provenance                   (Orchestrator, persisted)
 ├─ policy_evaluation (decision + violated)        (Policy Engine, persisted)
 ├─ approval (who/when)                            (persisted)
 ├─ action_record (pre/post state)                 (immutable)
 └─ outcome_evaluation (delta, result, causal conf)(immutable)
```

This is surfaced in the UI ("show the evidence") and via `GET
/v1/actions/{id}/audit` ([06](./06-api-boundaries.md)). It is the operational
embodiment of *evidence, not proof*: the trace shows exactly what the system knew
and how confident it was.

## 6. Audit observability

- `control.audit_entry` is append-only + hash-chained; a scheduled **chain-
  verification** job emits a metric/alert on any break.
- Sensitive-capability use (PII re-identification, policy configuration changes) is
  always audited and alertable.

## 7. Alerting (representative)

| Alert | Condition | Severity |
|-------|-----------|----------|
| Data staleness | freshness > threshold for an active account | high |
| Ingestion failure | sync failed / DLQ growing | high |
| Policy misconfig | deny-rate spikes or policy version missing | high |
| Execution failure | action execute error / rollback triggered | high |
| Guardrail breach | daily spend limit approached/exceeded | critical |
| Audit chain break | verification mismatch | critical |
| Grounding regression | LLM grounding-eval score below threshold | medium |
| Cost anomaly | LLM cost per recommendation spikes | medium |
| Outcome regression trend | rising share of `regressed` outcomes for a rec type | medium |

## 8. Dashboards

- **Ops health:** ingestion freshness, queue lag, error rates, SLOs.
- **Intelligence quality:** confidence & approval rates, evidence sufficiency,
  anomaly volume.
- **Action & outcome:** executions, policy denials by constraint, outcome mix,
  realized deltas — the emerging Action→Outcome asset.
- **AI ops:** tokens/cost/latency per provider, grounding & injection eval trends.
- **Security/audit:** sensitive-capability usage, chain verification, redaction
  test status.

## 9. Retention & privacy

- Metrics/traces retained per ops policy; **no PII or secrets** in any telemetry
  (enforced by redaction + CI).
- Audit and Decision Memory retained long-term (they are the accountability + the
  proprietary learning asset); retention is per-client configurable where
  required.
- LLM telemetry stores usage/provenance and hashes, not sensitive prompt bodies.

## 10. Feedback into learning

Outcome and approval telemetry feed the learning process
([11 §10](./11-optimization-workflow.md)) as **reviewed suggestions** — e.g. a
recommendation type with poor realized outcomes lowers its confidence calibration
after human review. Observability thus closes the loop without enabling
unsupervised auto-tuning.
