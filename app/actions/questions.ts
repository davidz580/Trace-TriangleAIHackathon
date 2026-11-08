"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const PublishQuestionSchema = z.object({
  question_key: z.string().min(1).max(50),
  question_text: z.string().min(1).max(500),
  question_type: z.enum(["text", "number", "rating", "boolean", "single_choice", "multi_choice"]),
  sort_order: z.number().int().min(0),
  is_required: z.boolean().default(true),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
});

export async function publishFormVersion(
  organizationId: string,
  questions: z.infer<typeof PublishQuestionSchema>[]
) {
  const supabase = await createClient();

  if (questions.length > 10) {
    return { error: "Organization reflection forms are limited to 10 active questions." };
  }

  const validated = z.array(PublishQuestionSchema).safeParse(questions);
  if (!validated.success) {
    return { error: validated.error.issues.map((issue) => issue.message).join("; ") };
  }

  // Deactivate current version
  await supabase
    .from("form_versions")
    .update({ is_active: false })
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  // Determine next version number
  const { data: versions } = await supabase
    .from("form_versions")
    .select("version_number")
    .eq("organization_id", organizationId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = (versions?.[0]?.version_number ?? 0) + 1;

  // Create new version
  const { data: formVersion, error: versionError } = await supabase
    .from("form_versions")
    .insert({
      organization_id: organizationId,
      version_number: nextVersion,
      is_active: true,
      published_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (versionError || !formVersion) {
    return { error: versionError?.message ?? "Failed to create form version." };
  }

  // Insert questions
  const questionInserts = validated.data.map((q, idx) => ({
    organization_id: organizationId,
    form_version_id: formVersion.id,
    question_key: q.question_key,
    question_text: q.question_text,
    question_type: q.question_type,
    sort_order: q.sort_order ?? idx,
    is_required: q.is_required,
  }));

  const { data: insertedQuestions, error: questionsError } = await supabase
    .from("organization_questions")
    .insert(questionInserts)
    .select();

  if (questionsError) {
    return { error: questionsError.message };
  }

  // Insert options for choice questions
  for (const q of validated.data) {
    if ((q.question_type === "single_choice" || q.question_type === "multi_choice") && q.options) {
      const dbQuestion = insertedQuestions?.find(
        (iq) => iq.question_key === q.question_key
      );
      if (dbQuestion) {
        await supabase.from("question_options").insert(
          q.options.map((opt, optIdx) => ({
            question_id: dbQuestion.id,
            option_value: opt.value,
            option_label: opt.label,
            sort_order: optIdx,
          }))
        );
      }
    }
  }

  return { success: true, formVersionId: formVersion.id };
}
