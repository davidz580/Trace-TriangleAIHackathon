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

  // Defensively pin the active form version so sessions always have a
  // questionnaire, even if the database trigger is not present.
  const { data: activeVersion } = await supabase
    .from("form_versions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from("activity_sessions")
    .insert({
      organization_id: organizationId,
      form_version_id: activeVersion?.id ?? null,
      ...parsed.data,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { session: data };
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
