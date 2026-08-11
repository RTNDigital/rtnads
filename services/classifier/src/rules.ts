import type { ClassificationAssignment } from "@rtnads/contracts";

/**
 * Deterministic context classifier (docs/02 §4, docs/07 §Classifier).
 *
 * Builds an entity's context vector from ingested facts plus rule-derived
 * signals. Every assignment is tagged with a `source` (ingested > rule) and a
 * confidence, so downstream can prefer authoritative context and the whole thing
 * is auditable. Pure and reproducible — no I/O, no clock.
 */

export interface ClassifyInput {
  campaign: {
    name: string;
    objective?: string | null; // platform objective, e.g. "OUTCOME_LEADS"
    maturity?: string | null; // learning | stabilizing | mature
  };
  account: {
    platform: string; // meta | google | ...
    market?: string | null;
    country?: string | null;
  };
  /** Authoritative context from ingestion/human — takes precedence over rules. */
  explicit?: Record<string, string>;
}

/** Normalize a platform objective to our canonical objective vocabulary. */
export function normalizeObjective(objective?: string | null): string | null {
  if (!objective) return null;
  const o = objective.toUpperCase();
  if (o.includes("LEAD")) return "leads";
  if (o.includes("SALE") || o.includes("PURCHASE") || o.includes("CONVERSION"))
    return "sales";
  if (o.includes("TRAFFIC") || o.includes("LINK_CLICK")) return "traffic";
  if (o.includes("AWARENESS") || o.includes("REACH")) return "awareness";
  return null;
}

/** Map a canonical objective to a likely conversion mechanism. */
export function conversionForObjective(objective: string | null): string | null {
  switch (objective) {
    case "leads":
      return "form-lead";
    case "sales":
      return "purchase";
    default:
      return null;
  }
}

/** Health Tourism subcategory keywords → taxonomy node key. */
const SUBCATEGORY_KEYWORDS: [RegExp, string][] = [
  [/rhino|nose\s?job/i, "rhinoplasty"],
  [/dental|implant|veneer|teeth/i, "dental"],
  [/facelift|face\s?lift/i, "facelift"],
  [/breast|augmentation|mammoplasty/i, "breast-surgery"],
  [/hair\s?transplant|fue|hair/i, "hair-transplant"],
  [/bariatric|gastric|sleeve|weight\s?loss/i, "bariatric-surgery"],
  [/body\s?contour|liposuction|tummy\s?tuck|lipo/i, "body-contouring"],
];

/** Infer a Health Tourism subcategory node key from a campaign name. */
export function inferSubcategory(name: string): string | null {
  for (const [re, key] of SUBCATEGORY_KEYWORDS) {
    if (re.test(name)) return key;
  }
  return null;
}

/**
 * Produce the context-vector assignments for an entity. Explicit (ingested)
 * values win over rule-derived ones for the same dimension.
 */
export function classifyCampaign(input: ClassifyInput): ClassificationAssignment[] {
  const out: ClassificationAssignment[] = [];
  const seen = new Set<string>();

  const add = (
    dimension_key: string,
    value: string | null | undefined,
    source: ClassificationAssignment["source"],
    confidence: number,
  ): void => {
    if (value == null || value === "" || seen.has(dimension_key)) return;
    out.push({ dimension_key, value, source, confidence });
    seen.add(dimension_key);
  };

  // 1. Explicit/ingested context is authoritative.
  for (const [key, value] of Object.entries(input.explicit ?? {})) {
    add(key, value, "ingested", 1);
  }

  // 2. Rule-derived signals fill the gaps.
  add("platform", input.account.platform, "ingested", 1);
  add("market", input.account.market ?? undefined, "ingested", 0.9);
  add("country", input.account.country ?? undefined, "ingested", 0.9);
  add("campaign_maturity", input.campaign.maturity ?? undefined, "ingested", 1);

  const objective = normalizeObjective(input.campaign.objective);
  add("objective", objective ?? undefined, "rule", 0.9);
  add("conversion_type", conversionForObjective(objective) ?? undefined, "rule", 0.7);

  const sub = inferSubcategory(input.campaign.name);
  if (sub) {
    // Store taxonomy dims as materialized paths so hierarchical similarity works.
    add("vertical", "health-tourism", "rule", 0.8);
    add("subcategory", `health-tourism/${sub}`, "rule", 0.8);
  }

  return out;
}
