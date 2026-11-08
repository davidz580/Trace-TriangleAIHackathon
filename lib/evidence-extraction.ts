"use server";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { callTinker } from "@/lib/tinker";

const EvidenceExtractionSchema = z.object({
  items: z.array(
    z.object({
      excerpt: z.string().min(1).max(2000),
      claim_type: z.enum(["metric", "narrative", "observation", "quote", "testimonial"]),
      tags: z.array(z.string()).optional(),
      quantitative_value: z.number().optional(),
      quantitative_unit: z.string().optional(),
      period: z.string().optional(),
      is_measured: z.boolean().optional(),
      is_estimated: z.boolean().optional(),
      is_goal: z.boolean().optional(),
    })
  ),
});

export interface ExtractedEvidenceItem {
  excerpt: string;
  claim_type: string;
  tags: string[];
  quantitative_value: number | null;
  quantitative_unit: string | null;
  period: string | null;
  is_measured: boolean | null;
  is_estimated: boolean | null;
  is_goal: boolean | null;
}

export async function extractEvidenceFromReflection(
  organizationId: string,
  reflectionId: string,
  answers: Record<string, string | number | boolean | string[]>,
  quoteText?: string | null
): Promise<{ items: ExtractedEvidenceItem[]; error?: string }> {
  const serviceClient = createServiceRoleClient();

  // Fetch reflection metadata
  const { data: reflection } = await serviceClient
    .from("volunteer_reflections")
    .select("date, host_site_id, format, participant_encounters, minutes_performed")
    .eq("id", reflectionId)
    .single();

  const { data: hostSite } = await serviceClient
    .from("host_sites")
    .select("name")
    .eq("id", reflection?.host_site_id ?? "")
    .single();

  const answerEntries = Object.entries(answers)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join("\n");

  const prompt = [
    "Extract structured evidence items from this volunteer reflection. Return ONLY valid JSON.",
    "",
    "=== REFLECTION METADATA ===",
    `Date: ${reflection?.date ?? "unknown"}`,
    `Host site: ${hostSite?.name ?? "unknown"}`,
    `Format: ${reflection?.format ?? "unknown"}`,
    `Participant encounters: ${reflection?.participant_encounters ?? "unknown"}`,
    `Minutes performed: ${reflection?.minutes_performed ?? "unknown"}`,
    "",
    "=== ANSWERS ===",
    answerEntries || "No answers provided.",
    "",
    quoteText ? `=== QUOTE ===\n"${quoteText}"` : "",
    "",
    "Instructions:",
    "- Create 1-5 evidence items that capture factual claims, observations, or quantitative data.",
    "- Do NOT fabricate numbers not present in the reflection.",
    "- Use claim_type 'metric' only for numeric measurements with units.",
    "- Use 'observation' for volunteered descriptions of events or behavior.",
    "- Use 'narrative' for general program descriptions.",
    "- Use 'quote' or 'testimonial' only when a quote is provided.",
    "- Tag each item with relevant themes (e.g., engagement, music, intergenerational).",
    "- For numeric values, set is_measured=true if the volunteer directly reported it, is_estimated=true if they guessed.",
    "- Never estimate values yourself. If no number is given, omit quantitative_value.",
    "",
    "Return ONLY compact raw JSON with an 'items' array. No markdown fences.",
  ].join("\n");

  try {
    const { data: result } = await callTinker({
      messages: [
        {
          role: "system",
          content:
            "You are an evidence extraction assistant for nonprofit program evaluation. You extract structured, factual evidence from volunteer reflections. You never fabricate data.",
        },
        { role: "user", content: prompt },
      ],
      schema: EvidenceExtractionSchema,
      maxRetries: 2,
    });

    const items = result.items.map((item) => ({
      excerpt: item.excerpt.slice(0, 2000),
      claim_type: item.claim_type,
      tags: item.tags ?? [],
      quantitative_value: item.quantitative_value ?? null,
      quantitative_unit: item.quantitative_unit ?? null,
      period: item.period ?? null,
      is_measured: item.is_measured ?? null,
      is_estimated: item.is_estimated ?? null,
      is_goal: item.is_goal ?? null,
    }));

    return { items };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    console.error(`[extractEvidence] reflection=${reflectionId} error=${message}`);
    return { items: [], error: message };
  }
}

export async function persistExtractedEvidence(
  organizationId: string,
  reflectionId: string,
  items: ExtractedEvidenceItem[]
) {
  const serviceClient = createServiceRoleClient();

  const inserts = items.map((item) => ({
    organization_id: organizationId,
    source_volunteer_reflection_id: reflectionId,
    source_historical_source_id: null,
    source_director_input_id: null,
    excerpt: item.excerpt,
    claim_type: item.claim_type,
    tags: item.tags.length > 0 ? item.tags : null,
    verification_status: "pending" as const,
    consent_status: null as string | null,
  }));

  if (inserts.length === 0) return { success: true };

  const { error } = await serviceClient.from("evidence_items").insert(inserts);

  if (error) {
    console.error(`[persistExtractedEvidence] error=${error.message}`);
    return { error: error.message };
  }

  return { success: true };
}
