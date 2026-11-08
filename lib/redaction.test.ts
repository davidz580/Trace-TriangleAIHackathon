import { describe, it, expect } from "vitest";
import { redactText, redactAnswers } from "./redaction";

describe("redactText", () => {
  it("redacts full names", () => {
    const result = redactText("Alice Johnson visited today.");
    expect(result.text).toBe("[NAME REDACTED] visited today.");
    expect(result.nameHits).toBe(1);
  });

  it("redacts room numbers", () => {
    const result = redactText("We performed in room 304B.");
    expect(result.text).toBe("We performed in [LOCATION REDACTED].");
    expect(result.roomHits).toBe(1);
  });

  it("flags health keywords", () => {
    const result = redactText("A resident with diabetes enjoyed the music.");
    expect(result.healthFlags).toContain("diabetes");
    expect(result.requiresReview).toBe(true);
  });

  it("does not flag clean text", () => {
    const result = redactText("The audience was very engaged and clapped loudly.");
    expect(result.nameHits).toBe(0);
    expect(result.roomHits).toBe(0);
    expect(result.healthFlags).toHaveLength(0);
    expect(result.requiresReview).toBe(false);
  });
});

describe("redactAnswers", () => {
  it("redacts string values and tracks sensitivity", () => {
    const { answers, hasSensitiveContent } = redactAnswers({
      standout: "Bob Smith laughed.",
      rating: 5,
    });
    expect(answers.standout).toBe("[NAME REDACTED] laughed.");
    expect(answers.rating).toBe(5);
    expect(hasSensitiveContent).toBe(true);
  });

  it("returns hasSensitiveContent false for clean answers", () => {
    const { hasSensitiveContent } = redactAnswers({
      notes: "Great performance.",
    });
    expect(hasSensitiveContent).toBe(false);
  });
});
