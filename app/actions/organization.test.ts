import { describe, it, expect } from "vitest";
import { mapCreateOrganizationError } from "@/lib/organization-errors";

describe("mapCreateOrganizationError", () => {
  it("returns a slug field error for unique violation on organizations_slug_key", () => {
    const result = mapCreateOrganizationError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "organizations_slug_key"',
    });

    expect(result).toEqual({
      fieldErrors: { slug: "This URL is already taken. Please choose another." },
    });
  });

  it("returns null for a different unique constraint", () => {
    const result = mapCreateOrganizationError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "some_other_key"',
    });

    expect(result).toBeNull();
  });

  it("returns null for a non-unique-violation error", () => {
    const result = mapCreateOrganizationError({
      code: "23503",
      message: "insert or update on table violates foreign key constraint",
    });

    expect(result).toBeNull();
  });

  it("returns null when code is missing", () => {
    const result = mapCreateOrganizationError({
      message: "some random error",
    });

    expect(result).toBeNull();
  });
});
