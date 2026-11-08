import { z } from "zod";
import { extractJson } from "./parse-json-response";

const TINKER_API_KEY = process.env.TINKER_API_KEY!;
const TINKER_BASE_URL = process.env.TINKER_BASE_URL!;
const TINKER_MODEL = process.env.TINKER_MODEL!;

export interface TinkerMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TinkerCallMeta {
  durationMs: number;
  status: number;
  finishReason?: string;
  tokenUsage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export async function callTinker<T>({
  messages,
  schema,
  maxRetries = 2,
}: {
  messages: TinkerMessage[];
  schema: z.ZodSchema<T>;
  maxRetries?: number;
}): Promise<{ data: T; meta: TinkerCallMeta }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const tinkerStart = Date.now();

    const response = await fetch(`${TINKER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TINKER_API_KEY}`,
      },
      body: JSON.stringify({
        model: TINKER_MODEL,
        messages,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      }),
    });

    const tinkerDuration = Date.now() - tinkerStart;

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tinker API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    const finishReason = choice?.finish_reason;

    if (!content) {
      lastError = new Error("Empty response from Tinker");
      continue;
    }

    if (finishReason === "length") {
      lastError = new Error("Incomplete model response: output was truncated due to token limit");
      continue;
    }

    try {
      const validated = extractJson(content, schema);
      return {
        data: validated,
        meta: {
          durationMs: tinkerDuration,
          status: response.status,
          finishReason,
          tokenUsage: data.usage
            ? {
                prompt_tokens: data.usage.prompt_tokens,
                completion_tokens: data.usage.completion_tokens,
                total_tokens: data.usage.total_tokens,
              }
            : undefined,
        },
      };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Validation failed");
      continue;
    }
  }

  throw lastError || new Error("Tinker call failed after retries");
}
