"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const SaveGrantSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(1).max(300),
  funderName: z.string().min(1).max(300).optional(),
  opportunityName: z.string().max(300).optional(),
  deadline: z.string().optional(),
  questions: z.array(
    z.object({
      question_text: z.string().min(1).max(5000),
      max_words: z.number().int().optional(),
    })
  ),
});

export async function saveGrantAnalysis(payload: z.infer<typeof SaveGrantSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const parsed = SaveGrantSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", parsed.data.organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership) return { error: "Forbidden" };

  const { data: grant, error: grantError } = await supabase
    .from("grants")
    .insert({
      organization_id: parsed.data.organizationId,
      title: parsed.data.title,
      funder_name: parsed.data.funderName ?? null,
      deadline: parsed.data.deadline ?? null,
      status: "draft",
    })
    .select()
    .single();

  if (grantError || !grant) {
    return { error: grantError?.message ?? "Failed to create grant." };
  }

  const requirementInserts = parsed.data.questions.map((q, idx) => ({
    organization_id: parsed.data.organizationId,
    grant_id: grant.id,
    requirement_key: `q_${idx + 1}`,
    question_text: q.question_text,
    max_words: q.max_words ?? null,
    sort_order: idx,
  }));

  const { error: reqError } = await supabase
    .from("grant_requirements")
    .insert(requirementInserts);

  if (reqError) {
    return { error: reqError.message };
  }

  revalidatePath("/grants");
  return { success: true, grantId: grant.id };
}

export async function getGrants(organizationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership) return { error: "Forbidden" };

  const { data: grants, error } = await supabase
    .from("grants")
    .select("id, title, funder_name, deadline, status, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return { grants: grants ?? [] };
}

export async function getGrantWithRequirements(grantId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: grant, error: grantError } = await supabase
    .from("grants")
    .select("*")
    .eq("id", grantId)
    .single();

  if (grantError || !grant) {
    return { error: grantError?.message ?? "Grant not found." };
  }

  const { data: requirements, error: reqError } = await supabase
    .from("grant_requirements")
    .select("*")
    .eq("grant_id", grantId)
    .order("sort_order", { ascending: true });

  if (reqError) {
    return { error: reqError.message };
  }

  return { grant: { ...grant, grant_requirements: requirements ?? [] } };
}

export async function updateGrantResponse(
  organizationId: string,
  requirementId: string,
  draftText: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (!membership) return { error: "Forbidden" };

  const { data: existing } = await supabase
    .from("grant_responses")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("requirement_id", requirementId)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("grant_responses")
      .update({ draft_text: draftText, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    // Need grant_id for the response; fetch it from requirement
    const { data: req } = await supabase
      .from("grant_requirements")
      .select("grant_id")
      .eq("id", requirementId)
      .single();

    if (!req) return { error: "Requirement not found." };

    const { error } = await supabase.from("grant_responses").insert({
      organization_id: organizationId,
      grant_id: req.grant_id,
      requirement_id: requirementId,
      draft_text: draftText,
      status: "draft",
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/grants`);
  return { success: true };
}
