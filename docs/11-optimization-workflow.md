# 11 — Optimization Workflow

The end-to-end loop that turns an active campaign into a learned outcome. It
threads together the domain model ([02](./02-domain-model.md)), the deterministic
engines ([07](./07-service-responsibilities.md)), MCP ([04](./04-mcp-architecture.md),
[05](./05-mcp-tool-contracts.md)), policy/permissions ([10](./10-permission-model.md)),
and events ([08](./08-event-flow.md)).

## 1. The loop

```
        ┌────────────────────────────────────────────────────────────┐
        │                                                            ▼
   (1) Observe → (2) Contextualize → (3) Cohort → (4) Benchmark → (5) Detect
        ▲                                                            │
        │                                                            ▼
   (10) Learn ← (9) Evaluate ← (8) Execute ← (7) Approve ← (6) Recommend
```

Steps 1–6 are Phase-1 (read-only) capable end-to-end; steps 7–10 activate in
Phase 2+. Steps 1–5 and the numeric parts of 6/9 are **deterministic (no LLM)**.

## 2. Step-by-step

### (1) Observe
Ingested ads + CRM facts land in the warehouse. A `warehouse.facts.updated` event
for an account/campaign starts (or refreshes) analysis.

### (2) Contextualize
The Classifier ensures the entity has a current **context vector** (vertical,
subcategory, platform, market, objective, conversion type, funnel stage, budget
range, maturity, creative attributes, seasonality, …). Context — not category
alone — drives everything downstream.

### (3) Build the cohort
Benchmark Engine calls `buildCohort` / `find_similar_campaigns`: selects
historically comparable RTN campaigns using weighted similarity across the
similarity attributes, weighting each observation by
`similarity · recency · sample_size · data_quality`
([02 §5](./02-domain-model.md)). The cohort and per-member `influence` are
persisted for audit.

### (4) Benchmark
`compareWithCohort`: the subject's metrics (business-specific — CPL *and* cost per
qualified lead, booking rate, ROAS, revenue per lead for Health Tourism) are
placed against the weighted cohort distribution → percentile + assessment
(`within_expected | underperforming | outperforming`).

### (5) Detect anomalies & opportunities
`detectAnomalies` flags spikes/drops/drift vs expected ranges; budget-efficiency
analysis flags saturation/under-funding. All deterministic.

### (6) Recommend
Two sub-steps preserve the determinism boundary:

- **6a Decision Engine (deterministic):** turns benchmark + anomaly + Strategy
  rules into *candidate* recommendations, each with `recommended_action`,
  `supporting_metrics`, `benchmark_comparison`, deterministic `confidence_score`,
  `risk_level`, `expected_outcome`, `evidence_window`, and
  `recommended_observation_period`.
- **6b AI Orchestrator (reasoning):** via MCP, assembles the evidence bundle,
  authors the human-readable `reasoning`, and frames **correlation vs causation**
  explicitly (historical outcomes are *evidence*, not proof). It may not add
  numbers. Output: a published, structured **Recommendation**
  ([05 §E](./05-mcp-tool-contracts.md)) with `model_provenance`.

The recommendation surfaces in the operator UI with full evidence and confidence.

### (7) Approve (human-in-the-loop)
An Optimizer/Admin reviews evidence and approves or rejects
([10](./10-permission-model.md)). Rejections are recorded (valuable training
signal). Phase 1 stops here (no execution).

### (8) Execute (policy-gated)
On approval, the proposed mutation is submitted through the Actions MCP → **Policy
Engine** (deterministic `allow | needs_approval | deny`). Only on `allow` (and
approval) does the **Action Executor**:
1. capture immutable `pre_state` (fresh read),
2. `applyMutation` via connector (idempotent),
3. record `platform_response` + initial `post_state`,
4. write an immutable `control.action_record`,
5. arm the outcome window at `t + observation_period`.
Guardrail breaches trigger rollback where the platform permits.

### (9) Evaluate the outcome
At window close, Outcome Eval deterministically compares `metrics_before` vs
`metrics_after`, computes `delta`, a `result` (improved/neutral/regressed/
inconclusive) and a `causal_confidence` — deliberately conservative, because a
metric can move for reasons unrelated to the action (seasonality, auction
dynamics). This conservatism is the operational expression of *evidence ≠ proof*.

### (10) Learn
Outcomes accumulate into the **Action → Outcome** dataset (Decision Memory). A
learning process proposes calibration updates (confidence tuning, similarity
weights, rule adjustments) as **suggestions to Strategy Memory**, reviewed by
humans before they change behavior — no closed-loop auto-tuning at MVP.

## 3. Worked example (Health Tourism)

```
Subject: Campaign "Rhino-UK-Meta-Q3", CPL £42, spend £3.1k/14d, 74 leads.
(2) Context: {vertical: health-tourism, subcategory: rhinoplasty, platform: meta,
             market: uk, objective: leads, conversion: form-lead, maturity: mature}
(3) Cohort: 22 historical RTN rhinoplasty/Meta/UK campaigns, recency-weighted.
(4) Benchmark: CPL p50 £45 (subject fine) BUT cost-per-qualified-lead £180 vs
             cohort p50 £120 → subject at p82 (underperforming on QUALITY).
(5) Signal: qualification_rate 0.23 vs cohort 0.41 (anomaly: low lead quality).
(6a) Candidate: shift budget from low-quality ad set A to ad set B (doctor-present
             before/after video), confidence 0.62, risk medium, obs period P14D.
(6b) Narrative: "Blended CPL is within cohort norms, but qualified-lead economics
             lag the cohort (p82). Ad set B's creative cohort historically yields
             ~1.7× qualification. This is correlational evidence, not proof;
             recommend a 20% reallocation and 14-day observation."
(7) Optimizer approves.
(8) Policy: 20% ≤ max 25%, cooldown ok, maturity ok, within daily limit → allow.
             Executor reallocates, records action.
(9) After 14d: cost-per-qualified-lead £150 (−17%), qualification 0.34.
             result = improved, causal_confidence = moderate (seasonality caveat).
(10) Learning: reinforce "doctor-present before/after for rhinoplasty/UK" weight
             (suggestion queued for review).
```

Note how the objective is the **funnel/quality**, not blended CPL — the brief's
core requirement that Health Tourism not optimize for CPL alone.

## 4. Guarantees the workflow upholds

- **No number without a deterministic source.** Every metric/benchmark/confidence
  comes from L3; the LLM only narrates.
- **No action without policy + approval.** The gate is unbypassable and fails
  closed.
- **No action without a record.** Immutable pre/post state + audit for every
  execution.
- **No conclusion of causation without evidence.** Outcome evaluation is
  conservative and the narrative must separate correlation from causation.
- **Recency- and quality-aware memory.** Cohort weighting prevents stale data from
  dominating.
