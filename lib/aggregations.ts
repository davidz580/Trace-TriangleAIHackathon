/**
 * Deterministic concert aggregation utilities.
 * Mirrors the SQL aggregate_concert_encounters logic in TypeScript
 * for unit testing and client-side verification.
 */

export interface ConcertReport {
  session_id: string;
  participant_encounters: number;
}

/**
 * Round .5 upward; matches PostgreSQL behavior used by the percentile_cont median.
 */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * Median of an array of numbers, rounding .5 upward.
 */
export function medianRounded(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  const raw = (sorted[mid - 1] + sorted[mid]) / 2;
  return roundHalfUp(raw);
}

/**
 * Per-concert median of participant_encounters; .5 rounded upward.
 * Then sum the concert-level medians. Never sums individual estimates directly.
 */
export function aggregateConcertEncounters(reports: ConcertReport[]): number {
  const bySession = new Map<string, number[]>();
  for (const r of reports) {
    if (typeof r.participant_encounters !== "number" || Number.isNaN(r.participant_encounters)) continue;
    const arr = bySession.get(r.session_id) ?? [];
    arr.push(r.participant_encounters);
    bySession.set(r.session_id, arr);
  }

  let total = 0;
  for (const [, values] of bySession) {
    const med = medianRounded(values);
    if (med !== null) {
      total += med;
    }
  }
  return total;
}
