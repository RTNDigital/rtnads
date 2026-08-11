# 10 — Permission Model

Two complementary layers of authority:

1. **RBAC** — what a *human user* may see and request (enforced at the BFF).
2. **Policy authority** — what *any actor* (human or AI) may cause to happen to a
   platform, enforced deterministically by the **Policy Engine**
   ([11](./11-optimization-workflow.md)).

RBAC decides *who can ask*. Policy decides *what may happen*. Both must pass. The
AI has **no** RBAC power to approve and **no** ability to relax policy.

## 1. Roles (RBAC)

| Role | Can view | Can approve/reject | Can execute | Can configure policy |
|------|----------|--------------------|-------------|----------------------|
| **Viewer** | dashboards, recs (read) | no | no | no |
| **Analyst** | + cohorts, evidence, audit | no | no | no |
| **Optimizer** | all analytics | approve/reject recommendations | trigger execution of approved+passed actions | no |
| **Client Admin** | all for their client | yes | yes | edit *their client's* optimization policy (within platform-admin bounds) |
| **Platform Admin (RTN)** | cross-client (as permitted) | yes | yes | edit global + per-client policy, automation permissions |
| **Auditor** | read-only incl. full audit chain & PII-vault access logs | no | no | no |
| **System (service principal)** | scoped per service | no | executes *only* approved+passed actions | no |
| **AI Orchestrator (principal)** | read via MCP; draft recs | **no** | **no** | **no** |

Roles are granted per `(user, client)` via `iam.membership`. A user may hold
different roles for different clients.

## 2. Capabilities

RBAC resolves to fine-grained capabilities checked at the BFF and re-checked at
the Control API:

```
ads.read              crm.read (anonymized)      knowledge.read
recommendation.read   recommendation.approve     recommendation.reject
action.execute        policy.read                policy.configure
audit.read            pii.reidentify (vault; auditor/authorized only)
```

The **AI Orchestrator principal** holds only: `ads.read`, `crm.read`,
`knowledge.read`, and `ads.action.request` (draft a *proposal*). It never holds
`recommendation.approve`, `action.execute`, or `policy.configure`.

## 3. Policy authority (the deterministic gate)

The Policy Engine enforces constraints on every proposed mutation, regardless of
who proposed or approved it. Constraints (from the brief):

- maximum allowed budget changes (absolute & %)
- minimum evidence requirements
- minimum spend requirements
- minimum conversion requirements
- cooldown periods after previous changes
- campaign maturity requirements
- client-specific automation permissions
- account-specific restrictions
- active experiment protection
- daily spend limits
- rollback rules

Policy is defined as **versioned data** (`knowledge.optimization_policy`, scoped by
client/account/context) and evaluated deterministically. Example (illustrative):

```jsonc
{
  "version": 7,
  "client_id": "uuid",
  "constraints": {
    "budget_change": { "max_percent": 0.25, "max_absolute": {"amount_minor": 50000, "currency": "GBP"} },
    "evidence": { "min_days": 7, "min_conversions": 20, "min_spend": {"amount_minor": 30000, "currency": "GBP"} },
    "cooldown": { "budget_change_hours": 48, "pause_hours": 24 },
    "maturity": { "min_campaign_state": "stabilizing" },
    "automation": { "budget_change": "requires_approval", "pause_ad": "requires_approval",
                    "activate": "requires_approval", "create_experiment": "requires_approval" },
    "account_restrictions": { "protected_accounts": ["uuid"], "excluded_actions": ["pause_campaign"] },
    "experiment_protection": true,
    "daily_spend_limit": {"amount_minor": 200000, "currency": "GBP"},
    "rollback": { "auto_rollback_on_guardrail": true }
  }
}
```

Evaluation returns `allow | needs_approval | deny` plus the exact violated
constraints, all recorded in `control.policy_evaluation`.

## 4. Automation permission tiers (per client / per account)

Automation level is a **client-configurable** policy field — the mechanism for the
phased-autonomy principle ([00 §3](./00-overview.md), [13](./13-mvp-milestones.md)):

| Tier | Meaning | Available when |
|------|---------|----------------|
| `read_only` | Recommendations only; no action tools offered | Phase 1 default |
| `requires_approval` | AI prepares actions; human must approve each | Phase 2 |
| `bounded_auto` | Narrow, low-risk actions may auto-execute within tight policy limits, still logged & rollback-able | Phase 3, only after sufficient Action→Outcome data |

Even at `bounded_auto`, the Policy Engine gates every action and daily/experiment
guardrails apply. No tier lets the AI edit policy or exceed limits.

## 5. Separation of duties

- The actor that **drafts** a recommendation (AI) is never the actor that
  **approves** it (human Optimizer/Admin) or **executes** it (System, post-gate).
- Policy **configuration** (`policy.configure`) is separated from policy
  **execution**; an Optimizer can approve within policy but cannot widen it.
- PII **re-identification** (`pii.reidentify`) is isolated to Auditor/authorized
  operators and separately audited ([09 §3](./09-security-model.md)).

## 6. Enforcement points

| Check | Where | Fails closed? |
|-------|-------|---------------|
| Authentication | BFF (OIDC session) | yes |
| RBAC capability | BFF + Control API (re-check) | yes |
| Tenancy scope | BFF (derive) + RLS + MCP re-validate | yes |
| Policy constraints | Policy Engine (only allow/deny authority) | yes |
| Approval present | Action Executor precondition | yes |
| Rollback rules | Action Executor / Outcome guardrails | yes |

Every enforcement point **fails closed**: absent or ambiguous authority denies the
action.

## 7. What the AI can and cannot do (explicit)

| AI can | AI cannot |
|--------|-----------|
| Read analytics/knowledge/anonymized CRM via MCP | See credentials or PII |
| Draft recommendations with narrative | Approve or reject recommendations |
| Request a mutation (proposal) via Actions MCP | Execute a mutation |
| Cite evidence & confidence produced by L3 | Compute or fabricate numbers |
| Suggest strategy/rule updates (for human review) | Change policy or automation tier |
| Operate across a client's accounts within its scope | Cross tenant boundaries |
