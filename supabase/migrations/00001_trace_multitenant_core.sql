-- Migration: 00001_trace_multitenant_core.sql
-- Phase: 2B — database architecture and migration design
-- Tables: organizations, user_profiles, organization_memberships
-- Helper functions: is_org_member, is_org_director, trigger_set_updated_at

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Organizations
-- ============================================================
CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    mission text,
    history text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- User Profiles (extends Supabase Auth users)
-- ============================================================
CREATE TABLE user_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Organization Memberships
-- ============================================================
CREATE TYPE membership_role AS ENUM ('owner', 'director', 'viewer');

CREATE TABLE organization_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    role membership_role NOT NULL DEFAULT 'viewer',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);

-- ============================================================
-- Helper Functions
-- ============================================================

-- Is the current user a member (any role) of the organization?
CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM organization_memberships
        WHERE organization_id = org_id
          AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Is the current user an owner or director of the organization?
CREATE OR REPLACE FUNCTION is_org_director(org_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM organization_memberships
        WHERE organization_id = org_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'director')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Is the current user the owner of the organization?
CREATE OR REPLACE FUNCTION is_org_owner(org_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM organization_memberships
        WHERE organization_id = org_id
          AND user_id = auth.uid()
          AND role = 'owner'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Atomic Organization Creation (transactional, owner-derived)
-- ============================================================
CREATE OR REPLACE FUNCTION create_organization(p_name text, p_slug text)
RETURNS uuid AS $$
DECLARE
    v_org_id uuid;
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    INSERT INTO organizations (name, slug)
    VALUES (p_name, p_slug)
    RETURNING id INTO v_org_id;

    INSERT INTO organization_memberships (organization_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'owner');

    RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION create_organization(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_organization(text, text) TO authenticated, service_role;

-- ============================================================
-- updated_at Triggers
-- ============================================================
CREATE TRIGGER set_updated_at_organizations
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_user_profiles
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_organization_memberships
    BEFORE UPDATE ON organization_memberships
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY organizations_select_member ON organizations
    FOR SELECT USING (is_org_member(id));

-- Organization creation is restricted to the create_organization() function
-- or the service role. No direct client inserts.
CREATE POLICY organizations_insert_service ON organizations
    FOR INSERT WITH CHECK (false);

CREATE POLICY organizations_update_director ON organizations
    FOR UPDATE USING (is_org_director(id));

CREATE POLICY organizations_delete_owner ON organizations
    FOR DELETE USING (is_org_owner(id));

-- user_profiles: self-managed
CREATE POLICY user_profiles_select_self ON user_profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY user_profiles_select_org_member ON user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM organization_memberships
            WHERE user_id = user_profiles.id
              AND organization_id IN (
                  SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid()
              )
        )
    );

CREATE POLICY user_profiles_update_self ON user_profiles
    FOR UPDATE USING (id = auth.uid());

-- organization_memberships: members read relevant rows; owners manage
CREATE POLICY organization_memberships_select_member ON organization_memberships
    FOR SELECT USING (
        is_org_member(organization_id)
        OR user_id = auth.uid()
    );

-- Membership creation is restricted to the create_organization() function
-- or the service role. No direct client inserts.
CREATE POLICY organization_memberships_insert_service ON organization_memberships
    FOR INSERT WITH CHECK (false);

CREATE POLICY organization_memberships_update_owner ON organization_memberships
    FOR UPDATE USING (is_org_owner(organization_id));

CREATE POLICY organization_memberships_delete_owner ON organization_memberships
    FOR DELETE USING (
        is_org_owner(organization_id)
        AND NOT (
            role = 'owner'
            AND user_id = auth.uid()
        )
    );
