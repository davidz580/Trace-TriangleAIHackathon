import { describe, it, expect, vi, beforeEach } from "vitest";

let formVersionsSingleResult: unknown = null;
let sessionsSingleResult: unknown = null;
let lastInsertPayload: unknown = null;

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === "form_versions") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve(formVersionsSingleResult)
                ),
              })),
            })),
          })),
        })),
      };
    }
    if (table === "activity_sessions") {
      return {
        insert: vi.fn((payload: unknown) => {
          lastInsertPayload = payload;
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve(sessionsSingleResult)),
            })),
          };
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

import { createSession } from "./sessions";

describe("createSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formVersionsSingleResult = null;
    sessionsSingleResult = null;
    lastInsertPayload = null;
  });

  it("pins the organization's active form version to a new session (regression)", async () => {
    const formVersionId = "form-version-uuid-123";
    formVersionsSingleResult = { data: { id: formVersionId }, error: null };
    sessionsSingleResult = {
      data: {
        id: "session-uuid",
        organization_id: "org-uuid",
        date: "2025-01-15",
        title: "Test Session",
        form_version_id: formVersionId,
      },
      error: null,
    };

    const result = await createSession("org-uuid", {
      date: "2025-01-15",
      title: "Test Session",
    });

    expect(result.error).toBeUndefined();
    expect(result.session).toBeDefined();
    expect(result.session!.form_version_id).toBe(formVersionId);

    // Verify the insert payload included the active form_version_id
    expect(lastInsertPayload).toMatchObject({
      organization_id: "org-uuid",
      date: "2025-01-15",
      title: "Test Session",
      form_version_id: formVersionId,
    });
  });

  it("rejects session creation when no active form version exists", async () => {
    formVersionsSingleResult = { data: null, error: { code: "PGRST116" } };

    const result = await createSession("org-uuid", {
      date: "2025-01-15",
      title: "Test Session",
    });

    expect(result.error).toContain("No published volunteer questionnaire");
    expect(result.session).toBeUndefined();
  });

  it("rejects invalid date format", async () => {
    const result = await createSession("org-uuid", {
      date: "01-15-2025",
      title: "Bad Date",
    });

    expect(result.error).toBeDefined();
    expect(result.session).toBeUndefined();
  });
});
