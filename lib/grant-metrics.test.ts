import { describe, it, expect } from "vitest";
import { computeGrantMetrics } from "./grant-metrics";
import type { OrgEvidenceBundle } from "./evidence";

function makeBundle(partial: Partial<OrgEvidenceBundle> = {}): OrgEvidenceBundle {
  return {
    organization: null,
    programs: [],
    goals: [],
    metrics: [],
    hostSites: [],
    quantitative: [],
    qualitative: [],
    reflections: [],
    directorInputs: [],
    historicalSources: [],
    quoteRecords: [],
    ...partial,
  };
}

describe("computeGrantMetrics", () => {
  it("returns empty array when no reflections", () => {
    const result = computeGrantMetrics(makeBundle());
    expect(result).toEqual([]);
  });

  it("computes total reflections", () => {
    const result = computeGrantMetrics(
      makeBundle({
        reflections: [
          { id: "1", date: "2025-01-01", participant_encounters: 10, minutes_performed: 30, format: null, host_site_name: "A" },
          { id: "2", date: "2025-01-02", participant_encounters: 20, minutes_performed: 45, format: null, host_site_name: "B" },
        ],
      })
    );
    const total = result.find((r) => r.name === "Total volunteer reflections submitted");
    expect(total?.value).toBe("2");
  });

  it("sums participant encounters", () => {
    const result = computeGrantMetrics(
      makeBundle({
        reflections: [
          { id: "1", date: null, participant_encounters: 10, minutes_performed: null, format: null, host_site_name: null },
          { id: "2", date: null, participant_encounters: 20, minutes_performed: null, format: null, host_site_name: null },
        ],
      })
    );
    const encounters = result.find((r) => r.name === "Total participant encounters");
    expect(encounters?.value).toBe("30");
  });

  it("sums minutes performed", () => {
    const result = computeGrantMetrics(
      makeBundle({
        reflections: [
          { id: "1", date: null, participant_encounters: null, minutes_performed: 30, format: null, host_site_name: null },
          { id: "2", date: null, participant_encounters: null, minutes_performed: 45, format: null, host_site_name: null },
        ],
      })
    );
    const minutes = result.find((r) => r.name === "Total volunteer activity minutes");
    expect(minutes?.value).toBe("75");
  });

  it("computes average participants per session", () => {
    const result = computeGrantMetrics(
      makeBundle({
        reflections: [
          { id: "1", date: null, participant_encounters: 10, minutes_performed: null, format: null, host_site_name: null },
          { id: "2", date: null, participant_encounters: 20, minutes_performed: null, format: null, host_site_name: null },
        ],
      })
    );
    const avg = result.find((r) => r.name === "Average participants per session");
    expect(avg?.value).toBe("15");
  });

  it("counts distinct host sites", () => {
    const result = computeGrantMetrics(
      makeBundle({
        reflections: [
          { id: "1", date: null, participant_encounters: null, minutes_performed: null, format: null, host_site_name: "Site A" },
          { id: "2", date: null, participant_encounters: null, minutes_performed: null, format: null, host_site_name: "Site A" },
          { id: "3", date: null, participant_encounters: null, minutes_performed: null, format: null, host_site_name: "Site B" },
        ],
      })
    );
    const sites = result.find((r) => r.name === "Locations served");
    expect(sites?.value).toBe("2");
  });

  it("does not include averages when there are no encounters", () => {
    const result = computeGrantMetrics(
      makeBundle({
        reflections: [
          { id: "1", date: null, participant_encounters: null, minutes_performed: null, format: null, host_site_name: null },
        ],
      })
    );
    const avg = result.find((r) => r.name === "Average participants per session");
    expect(avg).toBeUndefined();
  });

  it("rounds averages to one decimal place", () => {
    const result = computeGrantMetrics(
      makeBundle({
        reflections: [
          { id: "1", date: null, participant_encounters: 7, minutes_performed: null, format: null, host_site_name: null },
          { id: "2", date: null, participant_encounters: 4, minutes_performed: null, format: null, host_site_name: null },
        ],
      })
    );
    const avg = result.find((r) => r.name === "Average participants per session");
    expect(avg?.value).toBe("5.5");
  });
});
