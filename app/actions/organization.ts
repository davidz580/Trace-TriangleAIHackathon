"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { mapCreateOrganizationError } from "@/lib/organization-errors";

const CreateOrgSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
});

const UpdateOrgSchema = z.object({
  mission: z.string().max(2000).optional(),
  history: z.string().max(5000).optional(),
  service_region: z.string().max(500).optional(),
});

export async function createOrganization(formData: FormData): Promise<
  | { fieldErrors: Record<string, string> }
  | { error: string }
  | { organizationId: string }
> {
  const supabase = await createClient();
  const raw = Object.fromEntries(formData.entries());
  const parsed = CreateOrgSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") {
        fieldErrors[key] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });

  if (error) {
    const mapped = mapCreateOrganizationError(error);
    if (mapped) return mapped;
    return { error: error.message };
  }

  return { organizationId: data };
}

export async function updateOrganizationProfile(
  organizationId: string,
  payload: z.infer<typeof UpdateOrgSchema>
) {
  const supabase = await createClient();
  const parsed = UpdateOrgSchema.safeParse(payload);

  if (!parsed.success) {
    return { error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }

  const { error } = await supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", organizationId);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
