/**
 * Numeric-authorship guard (docs/09 §9, docs/14 §3).
 *
 * The LLM may only NARRATE; it must never introduce a number that isn't already
 * present in the deterministic evidence. This guard extracts every numeric token
 * from the model's narrative and flags any that do not appear in the grounded
 * evidence — the mechanism that prevents fabricated metrics from reaching a
 * recommendation.
 */

/** Extract normalized numeric tokens (commas stripped) from text. */
export function extractNumbers(text: string): Set<string> {
  const out = new Set<string>();
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  for (const m of matches) {
    const normalized = m.replace(/,/g, "");
    // Drop a trailing ".0" so "12" and "12.0" compare equal.
    out.add(normalized.replace(/\.0+$/, ""));
  }
  return out;
}

/**
 * Return the numeric tokens the narrative uses that are NOT grounded in the
 * evidence text. An empty array means every number is grounded.
 */
export function ungroundedNumbers(narrative: string, evidenceText: string): string[] {
  const allowed = extractNumbers(evidenceText);
  const used = extractNumbers(narrative);
  const bad: string[] = [];
  for (const n of used) {
    if (!allowed.has(n)) bad.push(n);
  }
  return bad;
}
