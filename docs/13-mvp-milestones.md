# 13 — MVP Milestones

Delivery is phased to honor the safety principle: **read-only first, approval
next, bounded autonomy only when earned by data.** Each milestone has explicit
acceptance criteria and produces a usable increment.

## Phasing overview

| Phase | Theme | Automation tier | Gate to next phase |
|-------|-------|-----------------|--------------------|
| 0 | Foundations | — | Contracts + skeleton reviewed |
| 1 | Read-only intelligence | `read_only` | Recommendations trusted by operators |
| 2 | Approval + controlled actions | `requires_approval` | Enough Action→Outcome data & policy confidence |
| 3 | Bounded autonomy (future) | `bounded_auto` | Demonstrated, evaluated outcome quality |

The brief's MVP = **Phase 0 + Phase 1 + the controlled-action slice of Phase 2**.

---

## Milestone M0 — Foundations (weeks ~1–3)

Scope: repo, contracts, warehouse skeleton, taxonomy, one connector read path.

- Monorepo per [12](./12-repository-structure.md); `contracts` + codegen pipeline.
- DB schemas + migrations + RLS for `core`, `facts`, `taxonomy`, `crm`, `iam`
  ([03](./03-database-model.md)).
- Taxonomy + dimension registry seeded (Health Tourism tree, initial dimensions).
- One ads connector (e.g. Meta) read path → raw landing → normalized `core`/`facts`.
- Telemetry, config, CI (lint, typecheck, boundary rules, secret-scan).

**Acceptance:** a real account syncs into normalized facts; taxonomy/dimensions are
data-extensible (add a subcategory with no migration); dependency-boundary and
secret-scan CI gates pass.

---

## Milestone M1 — Analytics & context (weeks ~3–6)

- CRM connector read path + **pseudonymization** at L1; `crm.*` populated.
- Classifier assigns context vectors; creative-attribute schema in place (may be
  sparsely populated).
- Analytics Engine: deterministic metrics, **unit economics**, funnel computation
  (Health Tourism funnel first).
- Ads Analytics MCP + CRM MCP (read-only) exposing snapshot/performance/unit-
  economics/lead-quality tools ([05](./05-mcp-tool-contracts.md)).

**Acceptance:** `get_account_snapshot`, `calculate_unit_economics`,
`get_sales_performance` return correct, reproducible numbers vs hand-computed
fixtures; no PII crosses L1; MCP responses validate against contracts.

---

## Milestone M2 — Cohorts, benchmarks, anomalies (weeks ~6–9)

- Benchmark Engine: cohort building with **weighted similarity** (similarity ·
  recency · sample · quality); `compare_with_cohort`; anomaly detection.
- `find_similar_campaigns`, `compare_with_cohort`, `detect_anomalies`,
  `get_budget_efficiency` tools.
- RTN Knowledge MCP + Strategy Memory store; first playbooks/benchmarks as
  resources (`rtn://…`).

**Acceptance:** cohorts are reproducible and auditable (members + influence
persisted); benchmark percentiles match fixtures; recency weighting demonstrably
down-weights old data; knowledge resources resolve by scope/URI.

---

## Milestone M3 — Recommendations (read-only) (weeks ~9–12) ← **Phase 1 complete**

- Decision Engine: candidate recommendations + deterministic confidence/risk.
- AI Orchestrator (behind provider abstraction) drafts narratives; correlation-vs-
  causation framing; `model_provenance` recorded.
- BFF + minimal operator UI: view recommendations with full evidence, cohort,
  benchmark, confidence; audit view.
- **Numeric-authorship guard**: validation blocks LLM-introduced numbers.

**Acceptance:** end-to-end read-only loop (observe→recommend) on real accounts;
every number traces to a deterministic source; recommendations are auditable;
operators rate recommendation usefulness (baseline for trust).

---

## Milestone M4 — Approval + controlled actions (weeks ~12–16) ← **MVP done**

- Approval Workflow (approve/reject, recorded).
- **Policy Engine** (deterministic) with the full constraint set
  ([10](./10-permission-model.md)); fails closed.
- Ads Actions MCP: `preview_*` (pure) + a **limited** set of gated write tools
  (start with `update_budget`, `pause_ad`) at `requires_approval`.
- Action Executor: pre/post state capture, immutable action records, rollback
  where supported; outcome-window scheduling + evaluation.
- Decision Memory + full audit chain.

**Acceptance:** an approved budget change or ad pause executes **only** after
policy pass + human approval; every action has an immutable record + audit entry;
policy denials are enforced and explained; rollback works on a supported platform;
outcome evaluation runs at window close.

---

## Post-MVP (not in initial scope)

| Item | Phase |
|------|-------|
| More platforms & richer action set (activate, reallocate, experiments) | 2+ |
| Creative metadata population (AI-generated) + creative cohort analysis | 2+ |
| E-commerce & Services objective models fully fleshed | 2+ |
| Learning loop: calibration/rule-tuning *suggestions* from Action→Outcome data | 2+ |
| Bounded autonomy for narrow, low-risk actions | 3 |
| Campaign *creation* capabilities | later |

## Cross-cutting "definition of done" (every milestone)

1. Contracts defined in `packages/contracts`; runtime-validated at boundaries.
2. Deterministic outputs covered by **golden-file** tests
   ([14](./14-testing-strategy.md)).
3. Tenancy (RLS) + security invariants (no creds/PII upward) tested.
4. Observability: structured logs, metrics, traces, audit entries
   ([15](./15-observability-strategy.md)).
5. Docs updated; ADRs for significant decisions.
