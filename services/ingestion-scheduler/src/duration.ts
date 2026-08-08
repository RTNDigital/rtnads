/**
 * Parse an ISO-8601 duration into milliseconds (docs/08 Flow E uses the
 * recommendation's `recommended_observation_period`, e.g. `"P14D"`).
 *
 * Weeks, days, hours, minutes and seconds are supported. Months and years are
 * intentionally rejected: their length is not fixed, so they cannot deterministically
 * become a millisecond offset — the property this whole scheduler depends on.
 */
export function parseIsoDuration(d: string): number {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(d);
  if (!m || d === "P" || d === "PT") throw new Error(`invalid or unsupported ISO-8601 duration: ${d}`);
  const [, w, days, h, min, s] = m;
  const seconds =
    Number(w ?? 0) * 7 * 86400 +
    Number(days ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(min ?? 0) * 60 +
    Number(s ?? 0);
  return seconds * 1000;
}
