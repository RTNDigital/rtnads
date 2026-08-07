# 05 — MCP Tool Contracts

Typed contracts for each MCP domain. Contracts are the **single source of truth**:
defined once (Zod schema), exported as TypeScript types and JSON Schema, and used
by both the MCP server and the orchestrator client. All money is `{ amount_minor:
int, currency: string }`. All responses are structured JSON.

Common envelope for every tool response:

```jsonc
{
  "ok": true,
  "data": { /* tool-specific */ },
  "meta": {
    "computed_at": "2026-08-07T10:00:00Z",
    "evidence_window": { "start": "…", "end": "…" },
    "data_quality": { "freshness_hours": 6, "completeness": 0.98, "sample_size": 143 },
    "provenance": "analytics-engine@1.4.2"      // which deterministic service produced it
  }
}
// on error: { "ok": false, "error": { "code": "…", "message": "…", "retriable": false } }
```

Shared context object (attached out-of-band, re-validated server-side — never
supplied by the LLM as free text):

```jsonc
"authz": { "client_id": "uuid", "principal": "user:uuid|system", "capabilities": ["ads.read", ...] }
```

Shared reference types:

```jsonc
EntityRef   { "type": "account|campaign|ad_set|ad|creative", "id": "uuid" }
DateWindow  { "start": "date", "end": "date" }
Money       { "amount_minor": 12345, "currency": "GBP" }
ContextVector { "vertical": "health-tourism", "subcategory": "rhinoplasty",
                "platform": "meta", "market": "uk", "...": "..." }
```

---

## A. Ads Analytics MCP (read-only)

### `get_account_snapshot`
```jsonc
// input
{ "authz": {...}, "account": "uuid", "window": DateWindow }
// data
{
  "account": { "id": "uuid", "name": "…", "platform": "meta", "maturity": "mature" },
  "totals": { "spend": Money, "impressions": 0, "clicks": 0, "conversions": 0,
              "conversion_value": Money },
  "derived": { "ctr": 0.0, "cpc": Money, "cpl": Money, "cpa": Money, "roas": 0.0 },
  "health": { "score": 0-100, "flags": ["budget_pacing", "learning_limited"] },
  "context": ContextVector
}
```

### `get_campaign_performance` / `get_adset_performance` / `get_ad_performance`
```jsonc
// input
{ "authz": {...}, "entity": EntityRef, "window": DateWindow,
  "granularity": "day|week|total", "metrics": ["spend","conversions","cpl","roas"] }
// data
{ "entity": EntityRef, "series": [ { "date": "…", "metrics": { "...": 0 } } ],
  "totals": { "...": 0 }, "context": ContextVector }
```

### `get_creative_performance`
```jsonc
// input
{ "authz": {...}, "scope": { "account": "uuid" } | { "campaign": "uuid" },
  "window": DateWindow, "group_by_attributes": ["hook","doctor_presence","format"] }
// data
{ "creatives": [ { "creative": EntityRef, "attributes": {...},
    "metrics": { "spend": Money, "cpl": Money, "roas": 0.0 } } ],
  "attribute_rollups": [ { "attribute": "doctor_presence", "value": "yes",
    "metrics": {...}, "sample_size": 12 } ] }
```

### `find_similar_campaigns`
```jsonc
// input
{ "authz": {...}, "subject": EntityRef,
  "attributes": ["vertical","subcategory","market","platform","objective",
                 "conversion_mechanism","budget_range","campaign_maturity",
                 "creative_characteristics"],
  "limit": 25, "min_similarity": 0.5, "recency_half_life_days": 180 }
// data
{ "cohort_id": "uuid",
  "members": [ { "campaign": EntityRef, "similarity": 0.87, "influence": 0.62,
                 "recency_days": 40, "sample_size": 210, "context": ContextVector } ],
  "weighting": { "similarity": "…", "recency": "…", "sample": "…", "quality": "…" } }
```

### `compare_with_cohort`
```jsonc
// input
{ "authz": {...}, "subject": EntityRef, "cohort_id": "uuid",
  "metrics": ["cpl","cost_per_qualified_lead","roas","booking_rate"] }
// data
{ "comparisons": [ { "metric": "cpl", "subject_value": 42.10,
    "cohort": { "p10": 30, "p50": 45, "p90": 70, "weighted_mean": 47 },
    "percentile": 0.38, "assessment": "within_expected|underperforming|outperforming" } ],
  "cohort_size": 22, "effective_sample": 3100 }
```

### `detect_anomalies`
```jsonc
// input
{ "authz": {...}, "scope": EntityRef, "window": DateWindow,
  "metrics": ["spend","cpl","ctr","conversions"], "sensitivity": "low|med|high" }
// data
{ "anomalies": [ { "entity": EntityRef, "metric": "cpl", "kind": "spike|drop|drift",
    "severity": "low|med|high", "observed": 92.0, "expected_range": [40,60],
    "detected_at": "…", "evidence": { "method": "robust_z", "z": 4.1 } } ] }
```

### `get_lead_quality` (analytics view; anonymized)
```jsonc
// input
{ "authz": {...}, "entity": EntityRef, "window": DateWindow }
// data
{ "distribution": [ { "band": "high", "count": 40, "share": 0.33 }, ... ],
  "cost_per_qualified_lead": Money, "qualification_rate": 0.41 }
```

### `get_sales_performance`
```jsonc
// data
{ "funnel": [ { "stage": "lead", "count": 120 }, { "stage": "qualified", "count": 49 },
    { "stage": "booking", "count": 18 }, { "stage": "sale", "count": 11 } ],
  "revenue": Money, "roas": 3.2, "revenue_per_lead": Money,
  "close_rate": 0.22, "margin": Money }
```

### `calculate_unit_economics`
```jsonc
// input
{ "authz": {...}, "entity": EntityRef, "window": DateWindow,
  "model": "health_tourism|ecommerce|services" }
// data
{ "cpl": Money, "cost_per_qualified_lead": Money, "cost_per_booking": Money,
  "cac": Money, "revenue_per_lead": Money, "roas": 3.2, "contribution_margin": Money,
  "assumptions": { "attribution_window_days": 30, "margin_rate": 0.4 } }
```

### `get_budget_efficiency`
```jsonc
// data
{ "entities": [ { "entity": EntityRef, "spend": Money, "marginal_cpl": Money,
    "saturation": 0.0-1.0, "reallocation_hint": "increase|hold|decrease" } ],
  "frontier": [ { "spend": Money, "expected_conversions": 0 } ] }  // deterministic curve
```

---

## B. RTN Knowledge MCP (read-only resources + lookups)

### Resources (by URI)
```
rtn://taxonomy/{vertical}                        -> taxonomy subtree (JSON)
rtn://playbooks/{vertical}/{subcategory}/{platform}
rtn://benchmarks/{vertical}/{subcategory}/{market}
rtn://clients/{clientId}/optimization-policy
```

Resource read result:
```jsonc
{ "uri": "rtn://benchmarks/health/rhinoplasty/uk", "version": "3",
  "scope": { "vertical":"health-tourism","subcategory":"rhinoplasty","market":"uk" },
  "content": { /* structured benchmark or playbook body */ },
  "effective_from": "2026-01-01", "source": "rtn-strategy" }
```

### `resolve_playbook`
```jsonc
// input:  { "authz": {...}, "scope": ContextVector }
// data:   { "playbook_uri": "rtn://playbooks/health/rhinoplasty/meta",
//           "matched_scope": {...}, "specificity": 0.9,
//           "rules": [ { "key": "…", "definition": {...} } ] }
```

### `list_benchmarks`
```jsonc
// input:  { "authz": {...}, "scope": ContextVector, "metrics": ["cpl","roas"] }
// data:   { "benchmarks": [ { "uri": "…", "metric": "cpl", "value": 45,
//             "unit": "GBP", "sample": {...}, "version": "3" } ] }
```

---

## C. CRM MCP (read-only, anonymized)

All identifiers are pseudonymous; no PII is representable in these contracts.

### `get_lead_quality_distribution`
```jsonc
// data: { "bands": [ { "band":"high","count":40,"share":0.33 } ],
//         "qualification_rate": 0.41, "sample_size": 120 }
```

### `get_funnel_conversion`
```jsonc
// input: { "authz": {...}, "scope": EntityRef | ContextVector, "window": DateWindow,
//          "vertical_model": "health_tourism" }
// data:  { "stages": [ { "from":"lead","to":"contacted","rate":0.8,"n":120 }, ... ],
//          "overall_lead_to_sale": 0.09 }
```

### `get_sales_outcomes`
```jsonc
// data: { "sales": 11, "revenue": Money, "avg_order_value": Money,
//         "sales_quality": [ { "band":"premium","count":3 } ] }
```

### `get_revenue_by_cohort`
```jsonc
// input: { "authz": {...}, "cohort_id": "uuid", "window": DateWindow }
// data:  { "revenue": Money, "roas": 3.2, "revenue_per_lead": Money }
```

---

## D. Ads Actions MCP (mutations — always via Policy Engine)

Preview tools are **pure** (no side effects). Write tools **request** a change;
they never execute. Execution occurs in the Control plane after policy + approval.

### `preview_budget_change` (pure)
```jsonc
// input
{ "authz": {...}, "entity": EntityRef, "change": { "type":"absolute|percent",
   "value": 1000, "currency": "GBP" } }
// data
{ "current_budget": Money, "proposed_budget": Money, "delta_percent": 0.2,
  "policy_preview": { "allowed": true, "violated_constraints": [],
    "requires_approval": true, "cooldown_ok": true },
  "projected_effect": { "note": "deterministic projection only, not a promise",
    "expected_daily_conversions_range": [8, 12] } }
```

### `update_budget` (write → gated)
```jsonc
// input
{ "authz": {...}, "entity": EntityRef, "change": {...},
  "recommendation_id": "uuid", "idempotency_key": "…" }
// data
{ "status": "pending_approval | rejected_by_policy | queued",
  "action_id": "uuid | null",
  "policy_evaluation": { "decision": "allow|deny|needs_approval",
    "violated_constraints": [ { "code":"MAX_BUDGET_DELTA","detail":"…" } ] } }
```

### `pause_campaign` / `pause_adset` / `pause_ad`
```jsonc
// input:  { "authz": {...}, "entity": EntityRef, "reason": "…",
//           "recommendation_id": "uuid", "idempotency_key": "…" }
// data:   { "status": "pending_approval|rejected_by_policy|queued",
//           "action_id": "uuid|null", "policy_evaluation": {...} }
```

### `activate_campaign` / `activate_adset` / `activate_ad`
Same shape as pause. Reactivation is itself policy-checked (e.g. experiment
protection, daily spend limits).

### `create_experiment`
```jsonc
// input
{ "authz": {...}, "scope": EntityRef, "design": { "type":"ab|holdout",
   "variants": [ {...} ], "duration_days": 14, "primary_metric": "cpl" },
  "recommendation_id": "uuid", "idempotency_key": "…" }
// data
{ "status": "pending_approval|rejected_by_policy|queued", "action_id": "uuid|null",
  "policy_evaluation": {...}, "experiment_preview": {...} }
```

**Invariant:** for every write tool, `status ∈ {rejected_by_policy,
pending_approval, queued}` — never `executed`. Execution status is observed via
the Control plane / Decision Memory, not returned synchronously from the MCP tool.

---

## E. The Recommendation object (produced by Decision Engine + AI narrative)

Not an MCP tool input but the canonical structured object the workflow centers on;
persisted in `intel.recommendation` and surfaced to the approval UI.

```jsonc
{
  "id": "uuid",
  "recommendation_type": "budget_increase|budget_decrease|reallocate|pause_ad|
                          pause_adset|creative_refresh|activate|create_experiment",
  "entity": EntityRef,
  "recommended_action": { /* concrete, executable params for an Actions MCP tool */ },
  "reasoning": "AI narrative grounded strictly in supporting_metrics & benchmark",
  "supporting_metrics": { /* deterministic, copied from Analytics MCP */ },
  "benchmark_comparison": { "cohort_id": "uuid", "metric": "cpl",
    "percentile": 0.38, "assessment": "underperforming" },
  "confidence_score": 0.0-1.0,
  "confidence_detail": { "evidence_strength": 0.7, "sample_adequacy": 0.6,
    "causal_support": "weak|moderate|strong", "recency": 0.9 },
  "risk_level": "low|medium|high",
  "expected_outcome": { "metric": "cpl", "direction": "decrease",
    "magnitude_range": [0.1, 0.25], "basis": "cohort_evidence" },
  "evidence_window": DateWindow,
  "recommended_observation_period": "P14D",
  "causation_note": "Historical outcomes are evidence, not proof of causation.",
  "model_provenance": { "provider": "…", "model": "…", "version": "…" }
}
```

Numbers in `supporting_metrics`, `benchmark_comparison`, and `confidence_score`
originate deterministically (L3). The LLM authors only `reasoning` (and must not
introduce numbers not present in the supplied evidence — enforced by validation,
see [14-testing-strategy](./14-testing-strategy.md)).
