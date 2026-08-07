# ADR-0000 — Architecture Decision Records

**Status:** Accepted

## Context
Significant architectural decisions must be recorded with their context and
consequences so future contributors understand *why*, not just *what*.

## Decision
We use lightweight **Architecture Decision Records (ADRs)**. Each ADR is an
immutable, numbered Markdown file in `docs/adr/`. When a decision changes, we add a
new ADR that supersedes the old one (the old one stays, marked *Superseded*).

Format: **Status**, **Context**, **Decision**, **Consequences** (and
*Alternatives* where useful).

Statuses: `Proposed` → `Accepted` → (`Superseded by ADR-XXXX` | `Deprecated`).

## Consequences
- A durable decision history independent of commit archaeology.
- ADRs are referenced from the specification documents where relevant.
