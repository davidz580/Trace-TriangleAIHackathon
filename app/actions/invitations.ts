"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import QRCode from "qrcode";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createInvitationToken(
  organizationId: string,
  sessionId: string,
  maxUses?: number,
  expiresAt?: string
) {
  const supabase = await createClient();
  const token = generateToken();

  const { data, error } = await supabase
    .from("session_invitation_tokens")
    .insert({
      organization_id: organizationId,
      session_id: sessionId,
      token,
      max_uses: maxUses ?? null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { token: data };
}

export async function listInvitationTokens(organizationId: string, sessionId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("session_invitation_tokens")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };
  return { tokens: data ?? [] };
}

export async function deactivateToken(organizationId: string, tokenId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("session_invitation_tokens")
    .update({ is_active: false })
    .eq("id", tokenId)
    .eq("organization_id", organizationId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function generateQRCodeDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: 256, margin: 2 });
}

/**
 * Resolve a token publicly via the service-role client.
 * This is safe because it runs server-side and never exposes the token row directly.
 */
export async function resolveInvitationToken(tokenValue: string) {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("lookup_token_by_value", {
    token_text: tokenValue,
  });

  if (error || !data || data.length === 0) {
    return { error: "Invalid or expired invitation" };
  }

  const token = data[0];

  // Also fetch session details and pinned form version
  const { data: session, error: sessionError } = await supabase
    .from("activity_sessions")
    .select("*, host_sites!activity_sessions_organization_id_host_site_id_fkey(name), activity_categories!activity_sessions_organization_id_activity_category_id_fkey(name), form_versions(id, version_number)")
    .eq("id", token.session_id)
    .eq("organization_id", token.organization_id)
    .single();

  if (sessionError || !session) {
    return { error: "Session not found" };
  }

  const formVersionId = session.form_version_id;
  if (!formVersionId) {
    return { error: "This session does not have a questionnaire assigned" };
  }

  // Fetch questions for this form version
  const { data: questions, error: questionsError } = await supabase
    .from("organization_questions")
    .select("*, question_options(*)")
    .eq("form_version_id", formVersionId)
    .eq("organization_id", token.organization_id)
    .order("sort_order", { ascending: true });

  if (questionsError) {
    return { error: "Failed to load questionnaire" };
  }

  return {
    token: {
      id: token.token_id,
      organization_id: token.organization_id,
      session_id: token.session_id,
      is_active: token.is_active,
      expires_at: token.expires_at,
      max_uses: token.max_uses,
      used_count: token.used_count,
    },
    session: {
      id: session.id,
      title: session.title,
      date: session.date,
      host_site_name: (session.host_sites as unknown as { name: string } | null)?.name ?? null,
      category_name: (session.activity_categories as unknown as { name: string } | null)?.name ?? null,
      form_version_id: session.form_version_id,
    },
    questions: questions ?? [],
  };
}
