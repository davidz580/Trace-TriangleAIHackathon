"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CreateSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
  activity_category_id: z.string().uuid().optional(),
  host_site_id: z.string().uuid().optional(),
});

export async function createSession(
  organizationId: string,
  payload: z.infer<typeof CreateSessionSchema>
) {
  const supabase = await createClient();
  const parsed = CreateSessionSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  // Verify a published questionnaire exists before creating a session.
  const { data: activeVersion } = await supabase
    .from("form_versions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!activeVersion) {
    return {
      error:
        "No published volunteer questionnaire found. Please publish your volunteer form in Onboarding before creating sessions.",
    };
  }

  const { data, error } = await supabase
    .from("activity_sessions")
    .insert({
      organization_id: organizationId,
      form_version_id: activeVersion.id,
      ...parsed.data,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { session: data };
}

export async function repairSessionFormVersion(organizationId: string, sessionId: string) {
  const supabase = await createClient();

  // Check if session has any reflections
  const { count } = await supabase
    .from("volunteer_reflections")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("session_id", sessionId);

  if (count && count > 0) {
    return { error: "Cannot repair: this session already has submissions." };
  }

  const { data: activeVersion } = await supabase
    .from("form_versions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!activeVersion) {
    return { error: "No published questionnaire found. Publish a volunteer form first." };
  }

  const { error } = await supabase
    .from("activity_sessions")
    .update({ form_version_id: activeVersion.id })
    .eq("id", sessionId)
    .eq("organization_id", organizationId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getActiveFormVersion(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_versions")
    .select("id, version_number, published_at")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .single();

  if (error) return { error: error.message };
  return { version: data };
}

export async function listSessions(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*, activity_categories!activity_sessions_organization_id_activity_category_id_fkey(name), host_sites!activity_sessions_organization_id_host_site_id_fkey(name)")
    .eq("organization_id", organizationId)
    .order("date", { ascending: false });

  if (error) return { error: error.message };
  return { sessions: data ?? [] };
}

export async function getSession(organizationId: string, sessionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*, activity_categories!activity_sessions_organization_id_activity_category_id_fkey(name), host_sites!activity_sessions_organization_id_host_site_id_fkey(name)")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .single();

  if (error) return { error: error.message };
  return { session: data };
}

export async function listSessionsWithReflectionCount(organizationId: string) {
  const supabase = await createClient();
  const { data: sessions, error: sessionsError } = await supabase
    .from("activity_sessions")
    .select("*, activity_categories!activity_sessions_organization_id_activity_category_id_fkey(name), host_sites!activity_sessions_organization_id_host_site_id_fkey(name)")
    .eq("organization_id", organizationId)
    .order("date", { ascending: false });

  if (sessionsError) return { error: sessionsError.message };

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return { sessions: [] };

  const { data: reflections, error: countsError } = await supabase
    .from("volunteer_reflections")
    .select("session_id")
    .in("session_id", sessionIds)
    .eq("organization_id", organizationId);

  if (countsError) return { error: countsError.message };

  const countMap = new Map<string, number>();
  for (const row of (reflections ?? [])) {
    const id = row.session_id as string;
    countMap.set(id, (countMap.get(id) ?? 0) + 1);
  }

  const enriched = (sessions ?? []).map((s) => ({
    ...s,
    reflection_count: countMap.get(s.id) ?? 0,
  }));

  return { sessions: enriched };
}
