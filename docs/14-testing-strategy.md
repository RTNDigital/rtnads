# 14 — Testing Strategy

Testing enforces the architecture's invariants, not just feature correctness. The
highest-value tests verify **determinism**, the **credential/PII boundaries**, the
**unbypassable policy gate**, and **LLM grounding**.

## 1. Test pyramid

```
        e2e / workflow            (few) — full loop on seeded data
     integration / contract       (some) — service ↔ service, MCP ↔ service, DB
   unit / property / golden        (many) — deterministic engines, policy, mappers
```

## 2. Deterministic-engine tests (the core discipline)

The math layer (Analytics, Benchmark, Decision) must be **pure and reproducible**.

- **Golden-file tests:** fixed warehouse fixture → engine → assert exact JSON
  output against a checked-in golden file. Any change to a number is a reviewed
  diff. Covers metrics, unit economics, funnels, cohort membership+influence,
  benchmark percentiles, anomaly flags, confidence scores.
- **Reproducibility test:** run the same computation twice (and across processes)
  → byte-identical results. No hidden nondeterminism (no wall-clock/random in
  outputs; time is an injected input).
- **Property-based tests:** invariants that must always hold, e.g.
  - similarity ∈ [0,1]; identical context ⇒ similarity = 1.
  - recency weighting is monotonic (older ⇒ ≤ influence, all else equal).
  - larger sample ⇒ ≥ influence; lower data-quality ⇒ ≤ influence.
  - percentile ∈ [0,1]; cohort of size 0 ⇒ explicit "insufficient evidence", never
    a fabricated benchmark.
- **Weighting regression:** a scenario library asserting that stale data cannot
  dominate a recent, larger, higher-quality cohort.

## 3. Boundary-invariant tests (security by test)

These fail CI, not just a suite:

- **No-credentials-upward:** scan every MCP payload, prompt, event and log line in
  integration runs for credential/secret patterns → zero hits
  ([09 §2](./09-security-model.md)).
- **No-PII-upward:** assert `crm.*` and all CRM MCP outputs contain only
  pseudonymous ids + computed bands; property test that CRM contracts *cannot*
  serialize a PII field.
- **Tenancy/RLS:** attempt cross-tenant reads at the DB and MCP layers → denied;
  fuzz `client_id` in request bodies → ignored (scope derived from session).
- **Numeric-authorship guard:** feed the orchestrator evidence bundles and assert
  the published recommendation introduces **no number** absent from the supplied
  deterministic evidence (regex + structured diff on numerics).

## 4. Policy-engine tests (unbypassable gate)

- **Decision-table tests:** exhaustive cases across each constraint (budget delta,
  min evidence/spend/conversions, cooldown, maturity, automation tier, account
  restrictions, experiment protection, daily spend limit) → asserted
  `allow | needs_approval | deny` + exact violated constraints.
- **Fail-closed tests:** missing/ambiguous policy or missing approval ⇒ deny.
- **No-bypass test:** assert there is no code path from orchestrator/Actions MCP to
  `action-executor.executeAction` that skips `evaluatePolicy` + approval
  (architectural test over the import/call graph).
- **Determinism:** same input ⇒ same policy decision.

## 5. Contract tests

- **Schema round-trip:** every `contracts` schema validates its fixtures; codegen
  types match runtime Zod.
- **MCP contract tests:** each MCP tool's I/O validated against its JSON Schema;
  server rejects malformed input and never emits malformed output.
- **Consumer-driven:** the orchestrator's expected tool shapes are pinned; a
  server change that breaks them fails CI.
- **Versioning:** additive change keeps old fixtures green; breaking change
  requires a new version + migration note.

## 6. Connector tests

- Recorded-fixture (VCR-style) tests for platform/CRM mappers → normalized shapes;
  no live calls in CI.
- Idempotency: replaying the same raw payload yields identical warehouse state.
- Write path: `applyMutation` is callable only by the Action Executor
  (architectural test) and is idempotent under `idempotency_key`.

## 7. LLM / orchestration tests (eval harness)

The LLM is nondeterministic, so it is tested as an **evaluated component**, not
with brittle string asserts.

- **Grounding evals:** given fixed evidence bundles, score whether the narrative
  (a) uses only supplied facts, (b) states confidence consistent with the
  deterministic score, (c) explicitly separates correlation from causation. Uses a
  rubric + LLM-as-judge with human spot-checks; tracked as metrics over time.
- **Tool-use evals:** the orchestrator selects appropriate MCP tools for scenario
  types; no attempt to compute numbers itself.
- **Injection resistance:** evidence bundles seeded with adversarial text (fake
  "instructions" in ad copy/CRM notes) must not change tool authority or produce a
  policy-violating proposal (worst case remains a rejected proposal).
- **Provider-parity smoke:** run the same eval set against ≥2 providers via the
  abstraction to confirm model-agnosticism ([ADR-0003](./adr/0003-model-agnostic-llm-boundary.md)).

Evals run on a schedule and on orchestrator/prompt changes; they gate releases by
threshold, not exact match.

## 8. Integration & end-to-end

- **Service integration:** engines ↔ warehouse ↔ MCP with a seeded Postgres
  (containerized), RLS enabled.
- **Workflow e2e:** seeded ads+CRM history → observe→…→recommend (Phase 1), and
  approve→policy→execute→evaluate on a **sandbox/mock platform** (never a live
  account in CI). Assert immutable action record + audit chain + outcome
  evaluation.
- **Audit-chain test:** hash chain verifies; tampering is detected.

## 9. Non-functional

- **Performance:** benchmark cohort/aggregation queries against representative data
  volumes; assert p95 targets for interactive reads.
- **Load/backpressure:** ingestion surge does not stall analysis; DLQ captures
  poison events.
- **Migration tests:** every DB migration is forward/rollback tested on seed data.

## 10. CI gates (must pass to merge)

1. typecheck (strict) + lint + **import-boundary** rules.
2. unit + property + **golden-file** determinism tests.
3. **secret-scan** + no-PII-upward + tenancy tests.
4. **policy decision-table** + no-bypass tests.
5. contract/MCP schema tests.
6. integration suite (containerized DB).
7. (scheduled, non-blocking-per-PR but release-gating) LLM eval thresholds.

## 11. Test data & fixtures

- Synthetic RTN-like history (multi-vertical, multi-market) in `packages/testkit`,
  including deliberately stale/low-quality cohorts to exercise weighting.
- No real PII in fixtures — pseudonymous by construction.
- Golden files are reviewed artifacts; regenerating them is an explicit, reviewed
  action.
