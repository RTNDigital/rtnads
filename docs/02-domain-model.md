# 02 — Domain Model

This document defines the conceptual domain: entities, the extensible industry
taxonomy, the campaign context model, the similarity/cohort model, the funnel and
outcome model, and the recommendation/action model. The physical schema is in
[03-database-model](./03-database-model.md).

## 1. Bounded contexts

| Context | Owns | Notes |
|---------|------|-------|
| **Advertising** | Account, Campaign, AdSet, Ad, Creative, insight facts | Platform-normalized. |
| **CRM / Outcomes** | Lead, funnel events, Sale, revenue | Pseudonymized; first-class. |
| **Taxonomy & Context** | Vertical tree, dimension registry, classifications | Extensible without schema change. |
| **Knowledge / Strategy** | Playbook, Rule, Benchmark, Optimization Policy | RTN's domain expertise. |
| **Intelligence** | Cohort, Benchmark result, Anomaly, Recommendation | Deterministic outputs + AI narrative. |
| **Control** | Approval, Action, Outcome evaluation, Audit entry | Immutable decision memory. |
| **Identity & Access** | Client, User, Role, Permission | Tenancy + RBAC. |

## 2. Core advertising entities

A normalized hierarchy that every platform maps into:

```
Client
 └─ AdAccount            (belongs to one platform, one client)
     └─ Campaign         (has an objective)
         └─ AdSet        (targeting, budget, schedule)   [Meta term; = Google ad group]
             └─ Ad
                 └─ Creative (may be shared across ads)
```

- **Client** — the RTN customer. Root of tenancy and policy.
- **AdAccount** — a platform account (`platform`, external id, currency, timezone,
  maturity).
- **Campaign / AdSet / Ad** — normalized entities carrying a stable internal id
  and the external platform id, plus lifecycle state and a **context
  classification** (§4).
- **Creative** — the asset; carries structured **creative metadata** (§7),
  populated later but modeled now.

Platform-specific vocabulary (e.g. Google "ad group" vs Meta "ad set") is mapped
to canonical terms by the connectors. Canonical term = **AdSet**.

## 3. Industry taxonomy (hierarchical, extensible)

The taxonomy is **data, not schema**. It is a tree of `TaxonomyNode`s:

```
TaxonomyNode { id, parent_id, key, label, level, path, metadata }
```

- Top level (verticals): Health Tourism, E-commerce, Services.
- Health Tourism children: Rhinoplasty, Dental, Facelift, Breast Surgery, Hair
  Transplant, Bariatric Surgery, Body Contouring.
- Arbitrary depth is allowed (e.g. `Dental → Implants`).

Because nodes are rows, **adding a vertical or subcategory requires no schema
change** — only data. A materialized `path` (e.g.
`health-tourism/dental/implants`) enables fast subtree queries and stable
resource URIs (`rtn://taxonomy/health-tourism`, see [05](./05-mcp-tool-contracts.md)).

## 4. Campaign context model

> **Industry category alone must never be the sole optimization context.**

Every advertising entity can be classified along many **context dimensions**. The
set of dimensions is itself a registry (`ContextDimension`), so new dimensions are
added as data:

Initial dimensions:

| Dimension | Example values |
|-----------|----------------|
| vertical | health-tourism, e-commerce, services |
| subcategory | rhinoplasty, dental, hair-transplant |
| platform | meta, google, tiktok |
| country | uk, de, tr |
| market | gcc, dach, nordics |
| language | en, de, ar |
| objective | leads, conversions, traffic, sales |
| conversion_type | form-lead, call, purchase, booking |
| funnel_stage | awareness, consideration, conversion |
| budget_range | low, mid, high (bucketed) |
| account_maturity | new, ramping, mature |
| campaign_maturity | learning, stabilizing, mature |
| creative_format | video, image, carousel, ugc |
| creative_attributes | before-after, doctor-present, testimonial |
| offer_type | discount, consultation, package |
| seasonality | peak, shoulder, off-peak |
| lead_quality | tiered score band |
| sales_quality | tiered score band |

A **Classification** attaches `(entity, dimension) → value` with a `source`
(`ingested`, `rule`, `ai-suggested`, `human`) and `confidence`. An entity has
many classifications; together they form its **context vector**.

Design consequences:
- Dimensions and their allowed values are **registered data**, extensible without
  migration.
- Classifications are **versioned** and **sourced** (auditability, and to weight
  human > rule > AI when they disagree).
- The context vector is the input to cohort selection (§5).

## 5. Similarity & cohort model

When evaluating an active campaign, the Benchmark Engine builds a **cohort** of
historically comparable RTN campaigns.

**Similarity attributes** (subset of the context vector, weighted):
vertical · subcategory · market · platform · objective · conversion mechanism ·
budget range · campaign maturity · creative characteristics.

**Similarity scoring** (deterministic, in L3):
- Each dimension contributes a partial similarity via a per-dimension comparator
  (exact match, hierarchical distance for taxonomy, bucket distance for ranges,
  embedding cosine for creative attributes).
- Dimension weights are configurable per vertical (Strategy Memory), because what
  makes campaigns "comparable" differs by business type.
- `similarity = Σ(weightᵢ · compare(dimᵢ))`, normalized to `[0,1]`.

**Observation weighting.** A historical observation's influence on a benchmark is
**not** uniform. It is weighted by:

```
influence = f(similarity) · g(recency) · h(sample_size) · q(data_quality)
```

- `f(similarity)` — closer cohorts count more.
- `g(recency)` — recent data counts more; old data decays (configurable
  half-life). *Old data must not automatically equal recent data.*
- `h(sample_size)` — more conversions/observations → more trustworthy.
- `q(data_quality)` — freshness/completeness penalties.

The cohort, its members, and the exact weights used are **persisted with each
benchmark result** so any recommendation can be reconstructed and audited.

## 6. Funnel & outcome model

The optimization objective is **business-specific**. The canonical Health Tourism
funnel:

```
Ad → Lead → Contacted → Qualified → Commercial Opportunity → Booking → Sale → Revenue
```

- **FunnelStage** is a per-vertical ordered list (data, not code), so E-commerce
  (`Ad → Add-to-cart → Purchase → Revenue`) and Services (`Ad → Lead → Booking →
  Close → Revenue`) define their own stages.
- **FunnelEvent** records an entity/lead transitioning to a stage at a time.
- **Lead** (pseudonymized) links advertising attribution to CRM outcomes.
- **Sale** carries revenue, and (where available) margin / customer value.
- **Lead quality** and **sales quality** are computed outcome dimensions fed back
  into the context model (§4) and into unit-economics analytics.

Because CRM is first-class, metrics like *cost per qualified lead*, *cost per
booking*, *revenue per lead*, *close rate* and *ROAS/CAC* are all computable — not
just CPL.

## 7. Creative intelligence model

Creatives carry **structured, AI-generated metadata** (schema now, population
later). Example dimensions:

creative format · duration · hook · subject · visual setting · procedure ·
speaker type · CTA · language · before/after usage · face presence · doctor
presence · voiceover · creative angle · message angle.

Stored as versioned attributes (same extensible pattern as context dimensions),
enabling **creative performance comparison within comparable cohorts** (e.g.
"doctor-present before/after videos vs testimonial images, rhinoplasty, GCC,
Meta"). Metadata `source` distinguishes ingested vs AI-suggested vs human-verified.

## 8. Recommendation model

Every recommendation is a structured object (contract in
[05](./05-mcp-tool-contracts.md)) containing:

- `recommendation_type` (e.g. budget-increase, pause-ad, reallocate, creative-refresh)
- `entity` (which account/campaign/adset/ad)
- `recommended_action` (concrete, executable parameters)
- `reasoning` (LLM narrative, grounded in supplied evidence)
- `supporting_metrics` (deterministic, from L3)
- `benchmark_comparison` (cohort + percentile position)
- `confidence_score` (deterministic score + AI qualitative)
- `risk_level`
- `expected_outcome`
- `evidence_window` (the data range the evidence covers)
- `recommended_observation_period` (how long to wait before judging results)

**Correlation vs causation** is explicit: the model records that historical
outcomes are *evidence*, and the reasoning must not claim a past action *caused* a
change without causal support. Confidence scoring penalizes causally-weak
evidence.

## 9. Action & outcome model

An approved recommendation becomes an **Action**. Every action produces an
**immutable ActionRecord**:

- pre-action state
- recommendation (reference)
- reasoning
- human approval status (who/when)
- executed change (exact parameters)
- timestamp
- post-action performance
- evaluation window
- action result (improved / neutral / regressed / inconclusive)

The accumulating **Action → Outcome** dataset is RTN's proprietary learning
asset. It feeds back into Strategy Memory (rule/weight tuning) and into confidence
calibration.

## 10. Entity relationship overview

```
Client 1───* AdAccount 1───* Campaign 1───* AdSet 1───* Ad *───1 Creative
   │                              │                         
   │                              ├──* Classification *──1 ContextDimension
   │                              │                         └── value ∈ registry
   │                              └──* FunnelEvent
   │
   ├──* OptimizationPolicy
   │
Lead *──1 AdAccount ,  Lead 1───* FunnelEvent ,  Lead 1───* Sale

TaxonomyNode 1───* TaxonomyNode (self, tree)

Cohort 1───* CohortMember (→ historical Campaign)
BenchmarkResult 1───1 Cohort
Recommendation *───1 BenchmarkResult ,  Recommendation *───1 Entity
Recommendation 1───0..1 Approval 1───0..1 Action 1───1 ActionRecord 1───* OutcomeEvaluation
```

See [03-database-model](./03-database-model.md) for tables, keys and the
extensibility mechanics.
