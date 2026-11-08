import { z } from "zod";
import { extractJson } from "./parse-json-response";

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
  const apiKey = process.env.TINKER_API_KEY!;
  const baseUrl = process.env.TINKER_BASE_URL!;
  const model = process.env.TINKER_MODEL!;

  let lastError: Error | null = null;

  const systemParts: string[] = [];
  const apiMessages: { role: "user" | "assistant"; content: string }[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else {
      apiMessages.push({ role: m.role, content: m.content });
    }
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const tinkerStart = Date.now();

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        ...(systemParts.length > 0 ? { system: systemParts.join("\n") } : {}),
        messages: apiMessages,
        max_tokens: 4096,
      }),
    });

    const tinkerDuration = Date.now() - tinkerStart;

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tinker API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: unknown) => (b as { type?: string })?.type === "text");
    const content = textBlock ? (textBlock as { text: string }).text : undefined;
    const finishReason = data.stop_reason;

    if (!content) {
      lastError = new Error("Empty response from Tinker");
      continue;
    }

    if (finishReason === "max_tokens") {
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
                prompt_tokens: data.usage.input_tokens,
                completion_tokens: data.usage.output_tokens,
                total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
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
