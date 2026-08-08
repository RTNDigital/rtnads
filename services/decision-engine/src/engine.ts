import type { RecommendationDraft } from "@rtnads/contracts";
import type { EvidenceBundle, DecisionConfig } from "./types.js";
import { DEFAULT_DECISION_CONFIG } from "./types.js";
import { generateCandidates } from "./rules.js";

/**
 * The Decision Engine (L3). Deterministically turns an evidence bundle into
 * candidate recommendation drafts with confidence and risk. It contains no LLM
 * and authors no narrative — the AI Orchestrator adds `reasoning` and provenance
 * downstream (docs/07, docs/11 §6).
 */
export class DecisionEngine {
  constructor(private readonly config: DecisionConfig = DEFAULT_DECISION_CONFIG) {}

  /** Generate candidate drafts, highest confidence first. */
  generate(ev: EvidenceBundle): RecommendationDraft[] {
    const drafts = generateCandidates(ev, this.config);
    return [...drafts].sort((a, b) => b.confidence_score - a.confidence_score);
  }
}
