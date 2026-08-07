# 09 — Security Model

Security is structural, not bolted on. Three non-negotiables from the brief drive
the design: **credentials never reach the LLM**, **PII is separated from
analytical data using internal pseudonymous identifiers**, and **the AI cannot
bypass policy**. (Policy/authority detail is in [10](./10-permission-model.md).)

## 1. Trust zones

```
Zone 0  Secrets Vault / KMS            (highest trust; no app logic)
Zone 1  Connectors (L1)                (hold platform + CRM credentials)
Zone 2  Warehouse + Engines + Control  (deterministic backend; pseudonymized data)
Zone 3  MCP servers (L4)               (thin adapters; scoped authz only)
Zone 4  AI Orchestrator + LLM provider (lowest trust re: data; no creds, no PII)
Zone 5  BFF / Operator UI              (human ingress; session auth + RBAC)
```

Data and secrets flow **down in privilege**: a credential in Zone 1 is never
representable in Zones 3–4; PII in Zone 1 is pseudonymized before Zone 2.

## 2. Credential isolation (LLM never sees secrets)

- Platform and CRM credentials live **only** in the Secrets Vault (Zone 0) and are
  loaded **only** by Connectors (Zone 1).
- No credential is ever placed in: warehouse rows, engine outputs, MCP tool
  inputs/outputs, recommendations, prompts, or logs.
- The Orchestrator (Zone 4) authenticates to MCP servers with a **scoped session
  token** minted by the control plane — capability grants, not secrets. It cannot
  read the vault and has no network path to platforms.
- Action execution uses credentials **inside** the Action Executor→Connector call
  only; the mutation *request* that the LLM produced carries no secret.

Invariant test ([14](./14-testing-strategy.md)): scan every prompt, MCP payload
and log for credential patterns; fail CI on any hit.

## 3. PII separation & pseudonymization

- CRM Connectors pseudonymize at the **L1 boundary**: raw PII (name, email, phone)
  is replaced with a stable, opaque `pseudonym_id` before anything enters Zone 2.
- The mapping `pseudonym_id ↔ real identity` is held in a **separate, restricted
  PII vault** with its own access control and audit — **not** in the analytical
  warehouse and **never** reachable by engines, MCP servers or the LLM.
- The analytical `crm.*` tables store only pseudonymous ids plus **computed,
  non-identifying** attributes (quality bands, funnel timings, revenue). Free-text
  fields that could carry PII are dropped or redacted at ingest.
- CRM MCP contracts ([05C](./05-mcp-tool-contracts.md)) are, by construction,
  incapable of expressing an individual — only distributions, rates and
  pseudonymous references.
- Re-identification requires explicit, separately-authorized access to the PII
  vault (operator-only, audited); the AI path has no such capability.

## 4. Tenancy isolation

- Every tenant-scoped row carries `client_id`; **PostgreSQL Row-Level Security**
  policies enforce `client_id = current_setting('app.client_id')` so a query
  cannot read another tenant even if application code errs.
- The BFF derives `client_id` from the **session principal**; it is never taken
  from a request body ([06 §5](./06-api-boundaries.md)).
- MCP calls carry a scoped `authz.client_id`, re-validated server-side against the
  session; the LLM cannot widen or switch tenant.

## 5. The unbypassable policy gate

- Every platform mutation path is: `Actions MCP (request) → Policy Engine
  (deterministic) → Approval → Action Executor → Connector`.
- The Action Executor **refuses** any action lacking a passing
  `policy_evaluation` and (for gated actions) an `approval`. There is no alternate
  code path to a platform write.
- The Policy Engine is deterministic and contains no LLM; the AI can neither call
  the executor directly nor alter policy definitions.

## 6. AuthN / AuthZ

- **Human users:** SSO/OIDC session at the BFF; RBAC per [10](./10-permission-model.md).
- **Services:** mutual TLS + short-lived service tokens; least-privilege network
  policy (only declared dependencies reachable).
- **MCP:** scoped capability tokens (`ads.read`, `crm.read`, `knowledge.read`,
  `ads.action.request`); the write scope is granted only to the Orchestrator's
  action-drafting session and still lands in the policy gate.

## 7. Data protection

- **In transit:** TLS everywhere (mTLS internally).
- **At rest:** encrypted volumes; the PII vault additionally encrypts the identity
  map with a distinct key.
- **Secrets:** only in Zone 0; rotated; never in env dumps or logs.
- **Raw landing zone:** access-controlled; may contain platform data but no
  cross-tenant mixing; retention-limited.

## 8. Auditability & tamper-evidence

- `control.audit_entry` is **append-only and hash-chained**
  ([03](./03-database-model.md)); every consequential event (recommendation,
  policy decision, approval, execution, rollback, PII-vault access) is recorded
  with actor, actor-kind and payload.
- Action records are immutable; outcomes are linked, not overwritten.
- Chain verification job detects tampering.

## 9. LLM-specific safety

- **Prompt-injection containment:** external text (ad copy, CRM notes, platform
  responses) is treated as untrusted. The LLM's authority is bounded by MCP
  capabilities + the policy gate, so injected instructions cannot execute a
  mutation, exfiltrate secrets, or read another tenant — the worst case is a bad
  *proposal*, which the deterministic gate and human approval reject.
- **No numeric authorship:** the LLM cannot introduce numbers into recommendations
  (validation blocks unsupported numerics), preventing fabricated metrics.
- **Provenance:** every LLM output records provider/model/version for audit and
  reproducibility.

## 10. Threat model (summary)

| Threat | Mitigation |
|--------|-----------|
| LLM leaks credentials | Credentials never enter Zones 2–4; CI secret-scan of prompts/logs |
| LLM exfiltrates PII | PII pseudonymized at L1; CRM contracts cannot express individuals |
| Prompt injection triggers a harmful action | Policy gate + human approval; LLM has no direct executor path |
| Cross-tenant access | Derived tenancy + RLS + MCP re-validation |
| Fabricated metrics in a recommendation | Deterministic numbers only; numeric-authorship validation |
| Runaway automation | Human-in-the-loop; cooldowns, daily spend limits, experiment protection (policy) |
| Audit tampering | Append-only hash-chained audit + verification |
| Compromised connector | Least-privilege scope per platform; rollback; anomaly detection on spend |

## 11. Compliance posture

Design supports data-subject handling (pseudonymous analytics + separable identity
map enable deletion/export at the PII vault without disturbing analytics),
region-aware storage where required, and per-client data-retention configuration.
Specific regulatory obligations are tracked per client in `iam.client.settings`.
