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
        max_tokens: 20000,
      }),
    });

    const tinkerDuration = Date.now() - tinkerStart;

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tinker API error: ${response.status} ${text}`);
    }

    const data = await response.json();

    let rawContent = "";
    let finishReason = data.stop_reason ?? data.choices?.[0]?.finish_reason ?? "unknown";

    if (Array.isArray(data.content)) {
      // Anthropic / Tinker multi-block format: text blocks first, then thinking fallback
      const textBlocks = data.content.filter(
        (b: unknown) => (b as { type?: string })?.type === "text"
      );
      rawContent = textBlocks
        .map((b: unknown) => (b as { text: string }).text)
        .filter((t: string) => t.length > 0)
        .join("");

      // If no text blocks, try thinking / reasoning blocks
      if (!rawContent) {
        const thinkBlocks = data.content.filter(
          (b: unknown) =>
            (b as { type?: string })?.type === "thinking" ||
            (b as { type?: string })?.type === "reasoning"
        );
        rawContent = thinkBlocks
          .map((b: unknown) =>
            ((b as { thinking?: string }).thinking) ??
            ((b as { text?: string }).text) ??
            ""
          )
          .filter((t: string) => t.length > 0)
          .join("");
      }
    } else if (data.choices?.[0]?.message?.content) {
      rawContent = data.choices[0].message.content;
    } else if (typeof data.text === "string") {
      rawContent = data.text;
    }

    // Strip Kimi/DeepSeek <think> wrappers if present
    const cleanedContent = rawContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    console.log(
      `[tinker] attempt=${attempt + 1}/${maxRetries + 1} request_id=${data.id ?? "unknown"} finish_reason=${finishReason} input_tokens=${data.usage?.input_tokens ?? data.usage?.prompt_tokens ?? "unknown"} output_tokens=${data.usage?.output_tokens ?? data.usage?.completion_tokens ?? "unknown"} raw_length=${rawContent.length} cleaned_length=${cleanedContent.length}`
    );

    const content = cleanedContent || rawContent;

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
