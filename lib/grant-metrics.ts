import type { OrgEvidenceBundle } from "./evidence";

export interface ComputedMetric {
  name: string;
  value: string;
  period: string;
  source: string;
}

export function computeGrantMetrics(evidence: OrgEvidenceBundle): ComputedMetric[] {
  const metrics: ComputedMetric[] = [];

  const totalReflections = evidence.reflections.length;
  if (totalReflections > 0) {
    metrics.push({
      name: "Total volunteer reflections submitted",
      value: String(totalReflections),
      period: "All time",
      source: "Computed from volunteer_reflections table",
    });
  }

  const totalEncounters = evidence.reflections.reduce(
    (sum, r) => sum + (r.participant_encounters ?? 0),
    0
  );
  if (totalEncounters > 0) {
    metrics.push({
      name: "Total participant encounters",
      value: String(totalEncounters),
      period: "All time",
      source: "Sum of participant_encounters from volunteer reflections",
    });
  }

  const totalMinutes = evidence.reflections.reduce(
    (sum, r) => sum + (r.minutes_performed ?? 0),
    0
  );
  if (totalMinutes > 0) {
    metrics.push({
      name: "Total volunteer activity minutes",
      value: String(totalMinutes),
      period: "All time",
      source: "Sum of minutes_performed from volunteer reflections",
    });
  }

  if (totalReflections > 0 && totalEncounters > 0) {
    metrics.push({
      name: "Average participants per session",
      value: String(Math.round((totalEncounters / totalReflections) * 10) / 10),
      period: "All time",
      source: "Computed: total encounters ÷ total reflections",
    });
  }

  const uniqueSites = new Set(evidence.reflections.map((r) => r.host_site_name).filter(Boolean));
  if (uniqueSites.size > 0) {
    metrics.push({
      name: "Locations served",
      value: String(uniqueSites.size),
      period: "All time",
      source: "Distinct host sites from volunteer reflections",
    });
  }

  return metrics;
}
