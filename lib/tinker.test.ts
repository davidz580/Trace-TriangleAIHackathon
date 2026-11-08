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
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
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
    expect(result.meta.status).toBe(200);
    expect(result.meta.finishReason).toBe("stop");
    expect(result.meta.tokenUsage).toEqual({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
  });

  it("throws a truncation error when finish_reason is 'length'", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"questions":[' }, finish_reason: "length" }],
        }),
        { status: 200 }
      )
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
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "{ bad json" }, finish_reason: "stop" }],
        }),
        { status: 200 }
      )
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
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ questions: [{ bad: true }] }) }, finish_reason: "stop" }],
        }),
        { status: 200 }
      )
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
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "" }, finish_reason: "stop" }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: "stop" }],
          }),
          { status: 200 }
        )
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
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify({ questions: [] }) },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200 }
      )
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
});
