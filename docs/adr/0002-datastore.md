# ADR-0002 — Primary datastore: PostgreSQL (+ pgvector)

**Status:** Proposed

## Context
We need relational integrity for the entity hierarchy and funnel, strong
analytical queries for benchmarking (window functions, percentiles), an
**extensible** taxonomy/context model without schema churn, row-level tenancy, and
creative similarity. We want to avoid premature polyglot persistence at MVP.

## Decision
Use **PostgreSQL** as the primary datastore:
- Relational tables for canonical entities, facts (partitioned), CRM outcomes.
- **JSONB** for extensible/config-shaped fields (context values, policy
  definitions, platform extras) alongside a **registry** pattern (taxonomy nodes,
  dimension registry) so new verticals/dimensions are *data, not migrations*.
- **Window functions** for benchmark distributions/percentiles.
- **Row-Level Security** for tenancy.
- **pgvector** for creative-embedding similarity (nullable, populated later) —
  avoiding a separate vector database at MVP.

## Consequences
- Single operational datastore at MVP; cohort math is deterministic SQL and thus
  reproducible/auditable.
- The extensibility requirement is met without DDL for new taxonomy/dimensions.
- Attribute-based cohort selection is exact SQL; only creative similarity needs
  vectors, which pgvector serves in-place.

## Future
- Introduce a columnar/analytics store or read replicas if fact volumes outgrow a
  single primary; the fact tables are already narrow and partitioned to ease this.
- A dedicated vector store only if creative embeddings scale beyond pgvector's
  comfort.

## Alternatives considered
- **Warehouse-first (BigQuery/Snowflake):** great for scale, weaker for
  transactional control-plane needs and RLS ergonomics at MVP.
- **Separate vector DB now:** unnecessary complexity before creative metadata is
  even populated.
