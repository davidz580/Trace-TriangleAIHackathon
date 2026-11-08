import { describe, it, expect } from "vitest";
import { medianRounded, aggregateConcertEncounters, type ConcertReport } from "./aggregations.ts";

describe("medianRounded", () => {
  it("returns the middle value for an odd number of elements", () => {
    expect(medianRounded([10, 30, 20])).toBe(20);
  });

  it("averages and rounds .5 upward for an even number of elements", () => {
    expect(medianRounded([20, 30])).toBe(25);
  });

  it("rounds .5 upward (24 + 25) / 2 = 24.5 -> 25", () => {
    expect(medianRounded([24, 25])).toBe(25);
  });

  it("rounds .5 upward (25 + 26) / 2 = 25.5 -> 26", () => {
    expect(medianRounded([25, 26])).toBe(26);
  });

  it("handles a single element", () => {
    expect(medianRounded([42])).toBe(42);
  });

  it("returns null for an empty array", () => {
    expect(medianRounded([])).toBeNull();
  });
});

describe("aggregateConcertEncounters", () => {
  it("sums medians for multiple concerts with different musician counts", () => {
    const reports: ConcertReport[] = [
      { session_id: "concert-a", participant_encounters: 10 },
      { session_id: "concert-a", participant_encounters: 20 },
      { session_id: "concert-a", participant_encounters: 30 },
      { session_id: "concert-b", participant_encounters: 15 },
      { session_id: "concert-b", participant_encounters: 16 },
      { session_id: "concert-c", participant_encounters: 5 },
      { session_id: "concert-c", participant_encounters: 7 },
      { session_id: "concert-c", participant_encounters: 9 },
      { session_id: "concert-c", participant_encounters: 11 },
    ];
    expect(aggregateConcertEncounters(reports)).toBe(44);
  });

  it("ignores reports with missing participant_encounters", () => {
    const reports = [
      { session_id: "concert-a", participant_encounters: 10 },
      { session_id: "concert-a", participant_encounters: NaN as unknown as number },
      { session_id: "concert-a", participant_encounters: 30 },
    ];
    expect(aggregateConcertEncounters(reports as ConcertReport[])).toBe(20);
  });

  it("returns 0 when there are no valid reports", () => {
    expect(aggregateConcertEncounters([])).toBe(0);
  });

  it("rounds each concert individually, which can differ from rounding the combined total", () => {
    // Concert A: [1,2] median = 1.5 -> rounds to 2
    // Concert B: [1,2] median = 1.5 -> rounds to 2
    // Sum of individually rounded = 4
    // Sum of unrounded = 3.0 -> would round/truncate to 3
    const reports: ConcertReport[] = [
      { session_id: "concert-a", participant_encounters: 1 },
      { session_id: "concert-a", participant_encounters: 2 },
      { session_id: "concert-b", participant_encounters: 1 },
      { session_id: "concert-b", participant_encounters: 2 },
    ];
    expect(aggregateConcertEncounters(reports)).toBe(4);
  });
});
