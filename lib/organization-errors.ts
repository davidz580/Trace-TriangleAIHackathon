export function mapCreateOrganizationError(error: { code?: string; message?: string }): { fieldErrors: Record<string, string> } | null {
  if (error.code === "23505" && error.message?.includes("organizations_slug_key")) {
    return { fieldErrors: { slug: "This URL is already taken. Please choose another." } };
  }
  return null;
}
