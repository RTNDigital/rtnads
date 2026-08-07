# 00 — Overview

## 1. Product vision

RTN Ads Intelligence is an AI-assisted advertising management and optimization
platform built specifically for **RTN House**. Its purpose is to convert RTN
House's accumulated advertising experience — across many clients, industries,
countries and campaigns — into a **reusable decision intelligence layer**.

Operationally, the system must be able to:

- Compare an active campaign against historically similar RTN campaigns.
- Identify anomalies and opportunities.
- Recommend optimization actions with reasoning and confidence.
- Execute approved actions through advertising platforms.
- Learn from the outcomes of those actions.

The differentiator is that intelligence is grounded in **RTN's own history**, not
in generic best practices. The proprietary asset the platform builds over time is
the **Action → Outcome dataset**: what RTN recommended, what was approved, what
was changed, and what happened next.

## 2. What this is not

- Not a generic AI advertising assistant.
- Not a campaign-*creation* tool (creation is explicitly out of scope for the
  MVP; the MVP prioritizes *intelligence*).
- Not an autonomous optimizer at launch. Autonomy is earned only after enough
  Recommendation → Action → Result data exists.
- Not an LLM that "does the analytics." The LLM never performs raw numerical
  analysis (see principle 3).

## 3. Guiding principles

1. **Agency-specific intelligence.** Every benchmark, cohort and playbook is
   rooted in RTN House data and RTN House strategy. Industry category alone is
   *never* the sole optimization context.

2. **Context over category.** Every advertising entity is classified across many
   contextual dimensions (vertical, subcategory, platform, country, market,
   language, objective, conversion type, funnel stage, budget range, account &
   campaign maturity, creative format/attributes, offer type, seasonality, lead
   quality, sales quality). Cohorts are built from context, not from a single
   label.

3. **Deterministic math, probabilistic reasoning.** LLMs do not compute.
   Aggregation, benchmarking, cohort selection, anomaly detection and statistics
   are performed deterministically by backend services. The LLM reasons and
   orchestrates over their structured results.

4. **Business-specific objectives.** The optimization target is defined per
   business type. Health Tourism does *not* optimize for CPL alone; it optimizes
   along the full funnel `Ad → Lead → Contacted → Qualified → Commercial
   Opportunity → Booking → Sale → Revenue`. CRM data is therefore a **first-class
   source**, not an afterthought.

5. **Evidence, not proof.** Historical outcomes are treated as *evidence*, never
   as automatic proof that a past action *caused* a performance change. The
   system explicitly distinguishes correlation from causation and quantifies its
   confidence.

6. **Recency- and quality-weighted memory.** Old historical data does not
   automatically carry the same weight as recent data. Observations are weighted
   by similarity, recency, sample size and data quality.

7. **Human-in-the-loop, phased autonomy.** Phase 1 read-only. Phase 2 approval of
   prepared actions. Phase 3 (bounded autonomy) only when justified by data.

8. **Deterministic, unbypassable policy.** A deterministic Policy Engine gates
   every mutation. The AI cannot circumvent it.

9. **Auditable by construction.** Every recommendation and executed action is
   immutably recorded.

10. **Model-agnostic core.** The core platform is not tightly coupled to Claude
    or any single LLM provider. Providers sit behind an abstraction; MCP is the
    integration boundary.

11. **Strongly typed, modular contracts.** Services communicate through explicit,
    versioned, strongly typed contracts. Modularity is preferred over a
    monolith.

12. **Least exposure of secrets & PII.** Credentials never reach the LLM. PII is
    separated from analytical data using internal pseudonymous identifiers.

## 4. Primary verticals

Top-level verticals (initial):

- **Health Tourism**
- **E-commerce**
- **Services**

Health Tourism subcategories (initial): Rhinoplasty, Dental, Facelift, Breast
Surgery, Hair Transplant, Bariatric Surgery, Body Contouring.

The industry taxonomy is **hierarchical and extensible without schema changes**
(see [02-domain-model](./02-domain-model.md) and
[03-database-model](./03-database-model.md)).

## 5. Performance objectives by business type

| Business type | Primary optimization frame |
|---------------|----------------------------|
| Health Tourism | Full funnel to **Revenue**: `Ad → Lead → Contacted → Qualified → Commercial Opportunity → Booking → Sale → Revenue`. Lead *and* sales quality matter. |
| E-commerce | Eventually CPA, ROAS, revenue, margin, customer value. |
| Services | Lead quality, booking rate, close rate, revenue. |

CRM outcomes are a first-class data source across all three.

## 6. The three knowledge layers

The system maintains three conceptually separate memories (detailed in
[02](./02-domain-model.md) and [03](./03-database-model.md)):

1. **Historical Performance Memory** — normalized advertising + CRM performance
   facts.
2. **Strategy Memory** — RTN House playbooks, rules, benchmarks and domain
   knowledge (exposed via the RTN Knowledge MCP).
3. **Decision Memory** — AI recommendations, approved/rejected actions, actual
   platform changes and subsequent outcomes.

## 7. Scope of the MVP

The first MVP prioritizes **intelligence over creation**. In scope:

- Advertising data ingestion
- CRM outcome ingestion
- Normalized data model
- Industry taxonomy
- Historical campaign classification
- Cohort benchmark engine
- Similar-campaign retrieval
- Account health analysis
- Anomaly detection
- Optimization recommendations
- Recommendation confidence scoring
- Human approval workflow
- Limited, controlled advertising actions
- Action result tracking
- Audit log

Out of scope for MVP: autonomous optimization, campaign creation, creative
generation. (Creative *metadata* schema is designed now but populated later.)

See [13-mvp-milestones](./13-mvp-milestones.md) for the phased plan.

## 8. Development requirement (why this repo is docs-first)

Per the brief, the entire application must **not** be implemented up front. The
required specifications — system architecture, domain model, database model, MCP
architecture, MCP tool contracts, API boundaries, service responsibilities, event
flow, security model, permission model, optimization workflow, repository
structure, MVP milestones, testing strategy, observability strategy — are
produced first and reviewed before implementation begins. This repository is that
specification set.
