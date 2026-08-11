import { Recommendation } from "@rtnads/contracts";
import type { RecommendationDraft } from "@rtnads/contracts";
import type { LlmProvider } from "@rtnads/llm-core";
import { ungroundedNumbers } from "./numeric-guard.js";

/**
 * AI Orchestrator (L5). It reasons over deterministic evidence and authors the
 * human-readable RATIONALE for a recommendation — it computes no numbers and
 * mutates nothing (docs/01 §6, docs/11 §6b). It is model-agnostic (depends only
 * on the llm-core interface) and records provider provenance.
 */

export class NarrativeValidationError extends Error {
  constructor(public readonly ungrounded: string[]) {
    super(`narrative contains ungrounded numbers: ${ungrounded.join(", ")}`);
    this.name = "NarrativeValidationError";
  }
}

export const DEFAULT_SYSTEM_PROMPT = [
  "You are RTN House's advertising reasoning layer.",
  "Write a concise, professional rationale for the proposed recommendation.",
  "Use ONLY the facts and numbers provided in the evidence — never invent or",
  "estimate any number. Explicitly distinguish correlation from causation:",
  "historical cohort outcomes are EVIDENCE, not proof that any action caused a",
  "change. Do not give financial guarantees.",
].join(" ");

export interface OrchestratorDeps {
  provider: LlmProvider;
  /** Injected clock and id factory so output is deterministic in tests. */
  now: () => string;
  newId: () => string;
  systemPrompt?: string;
}

export interface AuthorInput {
  clientId: string;
  draft: RecommendationDraft;
  /** Grounded, deterministic evidence the narrative may draw on (and only this). */
  evidenceText: string;
}

/** Serialize a draft's deterministic facts into grounded evidence text. */
export function buildEvidenceText(draft: RecommendationDraft): string {
  return JSON.stringify({
    recommendation_type: draft.recommendation_type,
    entity: draft.entity,
    recommended_action: draft.recommended_action,
    metric: draft.benchmark_comparison.metric,
    percentile: draft.benchmark_comparison.percentile,
    assessment: draft.benchmark_comparison.assessment,
    confidence_score: draft.confidence_score,
    confidence_detail: draft.confidence_detail,
    risk_level: draft.risk_level,
    expected_outcome: draft.expected_outcome,
    supporting_metrics: draft.supporting_metrics,
    evidence_window: draft.evidence_window,
    recommended_observation_period: draft.recommended_observation_period,
  });
}

export class AiOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  /**
   * Author the narrative for a draft and assemble a full, published
   * Recommendation. Throws NarrativeValidationError if the model introduced any
   * number not grounded in the evidence — the recommendation is never published
   * with a fabricated figure.
   */
  async authorRecommendation(input: AuthorInput): Promise<Recommendation> {
    const system = this.deps.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const userContent = [
      `Proposed recommendation: ${input.draft.recommendation_type}`,
      `Evidence (JSON, use only these facts and numbers):`,
      input.evidenceText,
      `Write 2-4 sentences of rationale.`,
    ].join("\n");

    const res = await this.deps.provider.complete({
      system,
      messages: [{ role: "user", content: userContent }],
      temperature: 0,
    });

    const reasoning = res.text.trim();
    const bad = ungroundedNumbers(reasoning, input.evidenceText);
    if (bad.length > 0) throw new NarrativeValidationError(bad);

    return Recommendation.parse({
      ...input.draft,
      id: this.deps.newId(),
      client_id: input.clientId,
      reasoning,
      model_provenance: {
        provider: res.provider,
        model: res.model,
        version: res.version,
      },
      status: "published",
      created_at: this.deps.now(),
    });
  }
}
