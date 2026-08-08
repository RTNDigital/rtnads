import type {
  OptimizationPolicy,
  ProposedChange,
  PolicyContext,
  PolicyEvaluation,
} from "@rtnads/contracts";
import { evaluate } from "./evaluate.js";

/**
 * The Policy Engine service. Wraps the pure `evaluate` with a FAIL-CLOSED guard:
 * a missing policy denies the action (never allows by default). This is the only
 * allow/deny authority for mutations (docs/09 §5, docs/10 §6).
 */
export class PolicyEngine {
  evaluate(
    policy: OptimizationPolicy | null | undefined,
    change: ProposedChange,
    ctx: PolicyContext,
  ): PolicyEvaluation {
    if (!policy) {
      return {
        decision: "deny",
        violated_constraints: [
          { code: "NO_POLICY", detail: "no optimization policy configured", level: "deny" },
        ],
        requires_approval: false,
        policy_version: 0,
      };
    }
    return evaluate(policy, change, ctx);
  }
}
