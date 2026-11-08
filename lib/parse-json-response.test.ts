import { describe, it, expect } from "vitest";
import { z } from "zod";
import { extractJson } from "./parse-json-response";

const TestSchema = z.object({
  questions: z.array(
    z.object({
      question_key: z.string(),
      question_text: z.string(),
      question_type: z.enum(["text", "number", "rating", "boolean", "single_choice", "multi_choice"]),
      options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
      rationale: z.string().optional(),
    })
  ),
});

describe("extractJson", () => {
  it("parses raw valid JSON", () => {
    const raw = JSON.stringify({
      questions: [
        {
          question_key: "test_key",
          question_text: "Test question?",
          question_type: "text",
          rationale: "Because testing.",
        },
      ],
    });

    const result = extractJson(raw, TestSchema);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].question_key).toBe("test_key");
  });

  it("parses JSON wrapped in a json markdown fence", () => {
    const raw = "```json\n" + JSON.stringify({
      questions: [
        {
          question_key: "fenced_key",
          question_text: "Fenced question?",
          question_type: "number",
        },
      ],
    }) + "\n```";

    const result = extractJson(raw, TestSchema);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].question_key).toBe("fenced_key");
  });

  it("parses JSON wrapped in a plain markdown fence", () => {
    const raw = "```\n" + JSON.stringify({
      questions: [
        {
          question_key: "plain_fence_key",
          question_text: "Plain fence question?",
          question_type: "boolean",
        },
      ],
    }) + "\n```";

    const result = extractJson(raw, TestSchema);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].question_key).toBe("plain_fence_key");
  });

  it("throws on malformed JSON", () => {
    const raw = "{ questions: [ ]"; // invalid JSON
    expect(() => extractJson(raw, TestSchema)).toThrow();
  });

  it("throws on truncated JSON (unterminated string)", () => {
    const raw = '{"questions":[{"question_key":"q1","question_text":"Unterminated';
    expect(() => extractJson(raw, TestSchema)).toThrow(/Unterminated string/);
  });

  it("throws on malformed JSON with invalid escaping", () => {
    const raw = '{"questions":[{"question_key":"q1","question_text":"Bad \\x escape"}]}';
    expect(() => extractJson(raw, TestSchema)).toThrow(/JSON/);
  });

  it("throws on valid JSON that fails Zod validation", () => {
    const raw = JSON.stringify({
      questions: [
        {
          question_key: "bad_key",
          question_text: "Bad question?",
          question_type: "invalid_type", // not in enum
        },
      ],
    });

    expect(() => extractJson(raw, TestSchema)).toThrow(/Schema validation failed/);
  });

  it("throws on empty response after stripping fences", () => {
    expect(() => extractJson("```json\n\n```", TestSchema)).toThrow(/Empty response/);
  });

  it("throws on nested markdown fences", () => {
    const raw = "```json\n```json\n{}\n```\n```";
    expect(() => extractJson(raw, TestSchema)).toThrow(/Unexpected nested markdown fences/);
  });
});
