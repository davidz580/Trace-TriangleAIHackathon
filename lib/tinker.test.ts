import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { callTinker } from "./tinker";

const TestSchema = z.object({
  questions: z.array(
    z.object({
      question_key: z.string(),
      question_text: z.string(),
      question_type: z.enum(["text", "number", "rating", "boolean", "single_choice", "multi_choice"]),
    })
  ),
});

function anthropicResponse({
  text,
  stopReason = "end_turn",
  usage,
}: {
  text: string;
  stopReason?: string;
  usage?: { input_tokens: number; output_tokens: number };
}) {
  return new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      model: "test-model",
      stop_reason: stopReason,
      usage,
    }),
    { status: 200 }
  );
}

describe("callTinker", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    vi.stubEnv("TINKER_API_KEY", "test-key");
    vi.stubEnv("TINKER_BASE_URL", "http://localhost/test");
    vi.stubEnv("TINKER_MODEL", "test-model");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns parsed data on a successful response", async () => {
    const payload = {
      questions: [{ question_key: "q1", question_text: "Hello?", question_type: "text" }],
    };

    fetchMock.mockResolvedValueOnce(
      anthropicResponse({
        text: JSON.stringify(payload),
        stopReason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      })
    );

    const result = await callTinker({
      messages: [{ role: "user", content: "test" }],
      schema: TestSchema,
      maxRetries: 0,
    });

    expect(result.data).toEqual(payload);
    expect(result.meta.status).toBe(200);
    expect(result.meta.finishReason).toBe("end_turn");
    expect(result.meta.tokenUsage).toEqual({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });
  });

  it("throws a truncation error when stop_reason is 'max_tokens'", async () => {
    fetchMock.mockResolvedValueOnce(
      anthropicResponse({
        text: '{"questions":[',
        stopReason: "max_tokens",
      })
    );

    await expect(
      callTinker({
        messages: [{ role: "user", content: "test" }],
        schema: TestSchema,
        maxRetries: 0,
      })
    ).rejects.toThrow(/truncated due to token limit/);
  });

  it("throws when JSON is malformed", async () => {
    fetchMock.mockResolvedValueOnce(
      anthropicResponse({
        text: "{ bad json",
        stopReason: "end_turn",
      })
    );

    await expect(
      callTinker({
        messages: [{ role: "user", content: "test" }],
        schema: TestSchema,
        maxRetries: 0,
      })
    ).rejects.toThrow(/JSON/);
  });

  it("throws when valid JSON fails Zod validation", async () => {
    fetchMock.mockResolvedValueOnce(
      anthropicResponse({
        text: JSON.stringify({ questions: [{ bad: true }] }),
        stopReason: "end_turn",
      })
    );

    await expect(
      callTinker({
        messages: [{ role: "user", content: "test" }],
        schema: TestSchema,
        maxRetries: 0,
      })
    ).rejects.toThrow(/Schema validation failed/);
  });

  it("retries once and succeeds on the second attempt", async () => {
    const payload = {
      questions: [{ question_key: "q1", question_text: "Hello?", question_type: "text" }],
    };

    fetchMock
      .mockResolvedValueOnce(
        anthropicResponse({
          text: "",
          stopReason: "end_turn",
        })
      )
      .mockResolvedValueOnce(
        anthropicResponse({
          text: JSON.stringify(payload),
          stopReason: "end_turn",
        })
      );

    const result = await callTinker({
      messages: [{ role: "user", content: "test" }],
      schema: TestSchema,
      maxRetries: 1,
    });

    expect(result.data).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("includes max_tokens: 4096 in the request body", async () => {
    fetchMock.mockResolvedValueOnce(
      anthropicResponse({
        text: JSON.stringify({ questions: [] }),
        stopReason: "end_turn",
      })
    );

    await callTinker({
      messages: [{ role: "user", content: "test" }],
      schema: TestSchema,
      maxRetries: 0,
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const requestBody = JSON.parse(requestInit.body as string);
    expect(requestBody.max_tokens).toBe(4096);
  });

  it("calls the Anthropic /v1/messages endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      anthropicResponse({
        text: JSON.stringify({ questions: [] }),
        stopReason: "end_turn",
      })
    );

    await callTinker({
      messages: [{ role: "user", content: "test" }],
      schema: TestSchema,
      maxRetries: 0,
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("http://localhost/test/v1/messages");
  });

  it("extracts system messages into the top-level system field", async () => {
    fetchMock.mockResolvedValueOnce(
      anthropicResponse({
        text: JSON.stringify({ questions: [] }),
        stopReason: "end_turn",
      })
    );

    await callTinker({
      messages: [
        { role: "system", content: "You are a test assistant." },
        { role: "user", content: "test" },
      ],
      schema: TestSchema,
      maxRetries: 0,
    });

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const requestBody = JSON.parse(requestInit.body as string);
    expect(requestBody.system).toBe("You are a test assistant.");
    expect(requestBody.messages).toEqual([{ role: "user", content: "test" }]);
  });

  it("finds the text block when the model returns thinking blocks first", async () => {
    const payload = {
      questions: [{ question_key: "q1", question_text: "Hello?", question_type: "text" }],
    };

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          content: [
            { type: "thinking", thinking: "some reasoning...", signature: "" },
            { type: "text", text: JSON.stringify(payload) },
          ],
          model: "test-model",
          stop_reason: "end_turn",
        }),
        { status: 200 }
      )
    );

    const result = await callTinker({
      messages: [{ role: "user", content: "test" }],
      schema: TestSchema,
      maxRetries: 0,
    });

    expect(result.data).toEqual(payload);
  });
});
