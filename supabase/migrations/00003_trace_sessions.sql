-- Migration: 00003_trace_sessions.sql
-- Phase: 2B — database architecture and migration design
-- Tables: activity_sessions, session_invitation_tokens

-- ============================================================
-- Activity Sessions
-- ============================================================
CREATE TABLE activity_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    activity_category_id uuid REFERENCES activity_categories(id) ON DELETE SET NULL,
    host_site_id uuid REFERENCES host_sites(id) ON DELETE SET NULL,
    date date NOT NULL,
    title text,
    notes text,
    created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id),
    -- Tenant-consistent foreign keys: ensure referenced records belong to the same org
    FOREIGN KEY (organization_id, activity_category_id) REFERENCES activity_categories(organization_id, id) ON DELETE SET NULL (activity_category_id),
    FOREIGN KEY (organization_id, host_site_id) REFERENCES host_sites(organization_id, id) ON DELETE SET NULL (host_site_id)
);

CREATE INDEX idx_activity_sessions_org_id ON activity_sessions(organization_id);
CREATE INDEX idx_activity_sessions_category_id ON activity_sessions(activity_category_id);
CREATE INDEX idx_activity_sessions_host_site_id ON activity_sessions(host_site_id);
CREATE INDEX idx_activity_sessions_date ON activity_sessions(date);

-- ============================================================
-- Session Invitation Tokens
-- ============================================================
CREATE TABLE session_invitation_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    expires_at timestamptz,
    used_count int NOT NULL DEFAULT 0,
    max_uses int,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- Tenant-consistent foreign key: token and session must share organization
    FOREIGN KEY (organization_id, session_id) REFERENCES activity_sessions(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_session_invitation_tokens_token ON session_invitation_tokens(token);
CREATE INDEX idx_session_invitation_tokens_org_id ON session_invitation_tokens(organization_id);
CREATE INDEX idx_session_invitation_tokens_session_id ON session_invitation_tokens(session_id);

-- ============================================================
-- updated_at Triggers (shared function defined in 00001)
-- ============================================================
CREATE TRIGGER set_updated_at_activity_sessions
    BEFORE UPDATE ON activity_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_session_invitation_tokens
    BEFORE UPDATE ON session_invitation_tokens
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_invitation_tokens ENABLE ROW LEVEL SECURITY;

-- activity_sessions: member read, director write
CREATE POLICY activity_sessions_select_member ON activity_sessions
    FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY activity_sessions_insert_director ON activity_sessions
    FOR INSERT WITH CHECK (is_org_director(organization_id));
CREATE POLICY activity_sessions_update_director ON activity_sessions
    FOR UPDATE USING (is_org_director(organization_id));
CREATE POLICY activity_sessions_delete_director ON activity_sessions
    FOR DELETE USING (is_org_director(organization_id));

-- session_invitation_tokens:
-- Directors manage tokens. Anonymous volunteers NEVER SELECT the token table directly.
-- Use lookup_token_by_value(token_text) SECURITY DEFINER function instead.
CREATE POLICY session_tokens_select_member ON session_invitation_tokens
    FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY session_tokens_insert_director ON session_invitation_tokens
    FOR INSERT WITH CHECK (is_org_director(organization_id));

CREATE POLICY session_tokens_update_director ON session_invitation_tokens
    FOR UPDATE USING (is_org_director(organization_id));

CREATE POLICY session_tokens_delete_director ON session_invitation_tokens
    FOR DELETE USING (is_org_director(organization_id));

-- ============================================================
-- SECURITY DEFINER: Anonymous token lookup
-- ============================================================
CREATE OR REPLACE FUNCTION lookup_token_by_value(token_text text)
RETURNS TABLE (
    token_id uuid,
    organization_id uuid,
    session_id uuid,
    is_active boolean,
    expires_at timestamptz,
    max_uses int,
    used_count int
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sit.id,
        sit.organization_id,
        sit.session_id,
        sit.is_active,
        sit.expires_at,
        sit.max_uses,
        sit.used_count
    FROM session_invitation_tokens sit
    WHERE sit.token = token_text
      AND sit.is_active = true
      AND (sit.expires_at IS NULL OR sit.expires_at > now())
      AND (sit.max_uses IS NULL OR sit.used_count < sit.max_uses);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Restrict token lookup to service role only. Never expose to anon or PUBLIC.
REVOKE EXECUTE ON FUNCTION lookup_token_by_value(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lookup_token_by_value(text) TO service_role;

-- submit_reflection() is defined in migration 00004 after its dependent tables exist.
