-- Migration: 00010_auth_user_profiles.sql
-- Ensures every auth.users row has a corresponding public.user_profiles row.
-- Fixes the organization-creation failure caused by missing profiles for
-- existing (or future) auth users.

-- ============================================================
-- Trigger Function: auto-create profile on new auth user
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, display_name)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'display_name',
            NEW.raw_user_meta_data ->> 'name',
            NEW.raw_user_meta_data ->> 'full_name'
        )
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Prevent direct invocation by public or anonymous users.
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon;

-- ============================================================
-- Trigger on auth.users
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- Backfill: create profiles for existing auth.users
-- ============================================================

INSERT INTO public.user_profiles (id, display_name)
SELECT
    au.id,
    COALESCE(
        au.raw_user_meta_data ->> 'display_name',
        au.raw_user_meta_data ->> 'name',
        au.raw_user_meta_data ->> 'full_name'
    )
FROM auth.users au
LEFT JOIN public.user_profiles up ON au.id = up.id
WHERE up.id IS NULL
ON CONFLICT (id) DO NOTHING;
