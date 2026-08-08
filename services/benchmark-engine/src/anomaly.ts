/**
 * Deterministic anomaly detection using a robust modified z-score (median + MAD).
 * Robust to outliers and small samples — no distributional assumptions, no LLM
 * (docs/05 detect_anomalies). Same series → same anomalies.
 */

export interface SeriesPoint {
  date: string;
  value: number;
}

export type AnomalyKind = "spike" | "drop";

export interface Anomaly {
  date: string;
  metric: string;
  kind: AnomalyKind;
  severity: "low" | "med" | "high";
  observed: number;
  expected_low: number;
  expected_high: number;
  z: number;
}

export interface AnomalyOptions {
  /** Modified z-score threshold; higher = less sensitive. Default 3.5. */
  threshold?: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function severityFor(absZ: number, threshold: number): Anomaly["severity"] {
  if (absZ >= threshold * 2) return "high";
  if (absZ >= threshold * 1.4) return "med";
  return "low";
}

/**
 * Detect anomalies in a metric series. Returns [] for series too short to judge
 * (< 4 points) or with zero dispersion — never fabricated flags.
 */
export function detectAnomalies(
  metric: string,
  series: SeriesPoint[],
  opts: AnomalyOptions = {},
): Anomaly[] {
  const threshold = opts.threshold ?? 3.5;
  if (series.length < 4) return [];

  const values = series.map((p) => p.value);
  const med = median(values);
  const absDev = values.map((v) => Math.abs(v - med));
  const mad = median(absDev);
  if (!(mad > 0)) return []; // no dispersion → nothing to flag

  // Consistency constant makes MAD comparable to standard deviation.
  const scale = mad / 0.6745;
  const expected_low = med - threshold * scale;
  const expected_high = med + threshold * scale;

  const anomalies: Anomaly[] = [];
  for (const p of series) {
    const z = (p.value - med) / scale;
    if (Math.abs(z) >= threshold) {
      anomalies.push({
        date: p.date,
        metric,
        kind: z > 0 ? "spike" : "drop",
        severity: severityFor(Math.abs(z), threshold),
        observed: p.value,
        expected_low,
        expected_high,
        z,
      });
    }
  }
  return anomalies;
}
