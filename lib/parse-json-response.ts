import { z } from "zod";

/**
 * Extracts and parses a JSON payload that may be wrapped in Markdown code fences.
 * Accepts:
 *   - Plain JSON
 *   - JSON wrapped in ```json ... ```
 *   - JSON wrapped in ``` ... ```
 *
 * Returns the parsed value.
 * Throws if the content is not valid JSON or if the outer text is not just fences/whitespace.
 */
export function extractJson<T>(raw: string, schema: z.ZodSchema<T>): T {
  const trimmed = raw.trim();

  // Match fenced code blocks (with or without language tag)
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/);
  const payload = fenceMatch ? fenceMatch[1].trim() : trimmed;

  if (!payload) {
    throw new Error("Empty response after stripping markdown fences");
  }

  // Safety check: if there are still backticks, the format is unexpected
  if (payload.includes("```")) {
    throw new Error("Unexpected nested markdown fences in response");
  }

  try {
    const parsed = JSON.parse(payload);
    return schema.parse(parsed);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const issues = e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Schema validation failed: ${issues}`);
    }
    throw e;
  }
}
