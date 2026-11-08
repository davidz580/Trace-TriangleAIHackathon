"use server";

import { createClient } from "@/lib/supabase/server";

export async function getEvidenceItems(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence_items")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message, items: [] };
  return { items: data ?? [] };
}

export async function getEvidenceItemsWithSources(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence_items")
    .select(`
      *,
      source_reflection:volunteer_reflections!evidence_items_source_volunteer_reflection_id_fkey(date, format, participant_encounters, minutes_performed, host_site_id),
      source_source:historical_sources!evidence_items_source_historical_source_id_fkey(title, content_excerpt),
      source_input:director_inputs!evidence_items_source_director_input_id_fkey(category, prompt_text, response_text)
    `)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message, items: [] };
  return { items: data ?? [] };
}

export async function getRecentReflections(organizationId: string, limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("volunteer_reflections")
    .select("id, date, format, participant_encounters, minutes_performed, submitted_at, host_sites(name)")
    .eq("organization_id", organizationId)
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (error) return { error: error.message, reflections: [] };
  return { reflections: data ?? [] };
}
