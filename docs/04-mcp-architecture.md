# 04 — MCP Architecture

Model Context Protocol (MCP) is the **integration interface** between the AI
orchestration layer (L5) and backend capabilities. This document defines the MCP
domains, their boundaries, and the rules that keep business logic *out* of MCP.

## 1. Cardinal rules

1. **No core business logic in MCP servers.** MCP servers are thin adapters. They
   translate a typed tool call into a call on an internal service (Analytics,
   Knowledge, CRM, Control) and translate the structured result back. All math,
   policy, and decisions live in the deterministic services behind them.
2. **Separate MCP domains.** Capabilities are split by concern and by trust level
   (read vs write, ads vs CRM vs knowledge). A server never spans domains.
3. **Structured JSON responses.** Tools return typed, schema-validated JSON
   whenever possible — never prose blobs the LLM must parse.
4. **Read/write separation.** Analytics, Knowledge and CRM MCPs are **read-only**.
   Only the Ads Actions MCP can request a mutation, and it must route through the
   Policy Engine — it never executes directly.
5. **Credentials and PII never cross the MCP boundary to the LLM.** Auth context
   is a scoped token resolved server-side; results are pseudonymized.
6. **Model-agnostic.** MCP is a standard the orchestrator speaks; swapping LLM
   providers does not change the MCP contracts.

## 2. The four MCP domains

```
                        ┌──────────────────────────────┐
                        │       AI Orchestrator (L5)     │
                        │   model-agnostic MCP client    │
                        └───┬───────┬────────┬───────┬───┘
             read-only      │       │        │       │   write (gated)
                 ┌──────────┘  ┌────┘   ┌────┘   └────────┐
                 ▼             ▼        ▼                 ▼
        ┌───────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │ Ads Analytics │ │   RTN    │ │   CRM    │ │  Ads Actions │
        │      MCP      │ │ Knowledge│ │   MCP    │ │     MCP      │
        │  (read-only)  │ │   MCP    │ │(read-only│ │ (mutations→  │
        │               │ │(resources│ │ anon)    │ │  Policy Eng) │
        └───────┬───────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘
                ▼              ▼            ▼               ▼
        Analytics/Benchmark  Knowledge    CRM service   Control plane
        /Decision services   service      (pseudonym)   (Policy→Executor)
```

### 2.1 Ads Analytics MCP — read-only analytics
Exposes deterministic analytical capabilities computed by L3. It **reads** the
warehouse and engine outputs; it computes nothing itself.

Representative tools (contracts in [05](./05-mcp-tool-contracts.md)):
`get_account_snapshot`, `get_campaign_performance`, `get_adset_performance`,
`get_ad_performance`, `get_creative_performance`, `find_similar_campaigns`,
`compare_with_cohort`, `detect_anomalies`, `get_lead_quality`,
`get_sales_performance`, `calculate_unit_economics`, `get_budget_efficiency`.

### 2.2 RTN Knowledge MCP — Strategy Memory as resources
Exposes RTN benchmarks, category playbooks and strategy resources, primarily as
**MCP resources** addressed by URI:

```
rtn://taxonomy/health-tourism
rtn://playbooks/health/rhinoplasty/meta
rtn://playbooks/health/dental/google
rtn://benchmarks/health/rhinoplasty/uk
rtn://benchmarks/health/dental/germany
rtn://clients/{clientId}/optimization-policy
```

Plus lookup tools (e.g. `resolve_playbook`, `list_benchmarks`) for
scope-based retrieval. Read-only.

### 2.3 CRM MCP — anonymized outcomes
Exposes **anonymized** lead-quality and sales-outcome data (pseudonymous ids
only). Read-only. Enforces PII separation server-side; the LLM sees bands, rates
and aggregates, never a person.

Representative tools: `get_lead_quality_distribution`, `get_funnel_conversion`,
`get_sales_outcomes`, `get_revenue_by_cohort`.

### 2.4 Ads Actions MCP — controlled mutations
Exposes controlled advertising-platform mutations. **Every action tool routes
through the Policy Engine; none executes directly.** Preview tools are pure
(no side effects) and let the AI/human inspect a change before requesting it.

Representative tools: `preview_budget_change`, `update_budget`, `pause_campaign`,
`pause_adset`, `pause_ad`, `activate_campaign`, `activate_adset`, `activate_ad`,
`create_experiment`.

Behavior of a write tool:
```
update_budget(...)  ->  build proposed change
                    ->  Policy Engine.evaluate(change, context)   [deterministic]
                    ->  if allowed & approval required: enqueue for human approval
                    ->  return { status, policy_evaluation, action_id? }
                    ->  execution happens in Control plane, NOT in the MCP server
```

## 3. What lives where (boundary table)

| Concern | Lives in | NOT in |
|---------|----------|--------|
| Aggregation, unit economics | Analytics Engine (L3) | MCP server |
| Cohort building, similarity, benchmarks | Benchmark Engine (L3) | MCP / LLM |
| Anomaly detection | Benchmark/Analytics (L3) | MCP / LLM |
| Recommendation *drafting logic* | Decision Engine (L3) + AI narrative (L5) | MCP server |
| Policy enforcement | Policy Engine (L6) | MCP / LLM |
| Action execution & rollback | Action Executor (L6) | MCP server |
| Tool schema / adaptation | MCP server | services |
| Reasoning / tool orchestration | AI Orchestrator (L5) | MCP server |

## 4. Server topology & transport

- Each MCP domain is a **separate server process** (separate deployables,
  separate authorization scopes). This isolates the write domain from the read
  domains and lets them scale and be audited independently.
- Transport: streamable HTTP MCP endpoints (server-to-server) behind the internal
  network; the orchestrator is the only client. No MCP server is exposed to the
  public internet.
- Each server validates every tool input/output against its JSON Schema/Zod
  contract and rejects on mismatch.

## 5. Authorization context

Every MCP call carries a **scoped authorization context** (client_id, user/system
principal, granted capabilities) minted by the control plane — *not* raw
credentials. Servers:
- enforce tenancy (client scoping) on every query,
- enforce read-only vs write per domain,
- record an audit entry for every write-domain call.

The LLM cannot forge or widen this context; it is attached out-of-band by the
orchestrator's trusted session, and re-validated server-side.

## 6. Versioning & compatibility

- Tool contracts are **versioned**; breaking changes ship as new tool
  names/versions, never silent shape changes.
- Contracts are the single source of truth shared with the client via generated
  types (see [05](./05-mcp-tool-contracts.md) and
  [06](./06-api-boundaries.md)).

## 7. Relationship to platform-native MCPs

Third-party platform MCPs (e.g. a vendor Meta Ads MCP) may exist in the
environment. RTN's own MCP domains **wrap and normalize** platform access behind
RTN contracts and the Policy Engine; the orchestrator talks to **RTN MCP domains**,
not directly to platform MCPs, so that determinism, policy, tenancy and audit are
never bypassed.
