-- ─────────────────────────────────────────────────────────────────────────
-- Wave 76.21 — convert public_profiles from a SECURITY DEFINER view
-- into a synced table.
-- ─────────────────────────────────────────────────────────────────────────
--
-- Supabase Advisor flagged the existing view as CRITICAL:
--   "View public.public_profiles is defined with the SECURITY DEFINER
--    property."
--
-- The original migration (20260520000000_public_profiles_view.sql) used
-- a SECURITY DEFINER view to project a public-safe subset of `profiles`
-- so community-feed embeds could fetch display_name + avatar without
-- exposing email, tier, demographics, etc. The base table's self-only
-- RLS made a SECURITY INVOKER view useless (it would return zero rows
-- for non-self lookups).
--
-- The advisor is correct that SECURITY DEFINER views are fragile — a
-- future maintainer adding `email` (or any PII column) to the SELECT
-- list silently exposes that data to every authenticated user. The
-- view-level comment warns, but warnings rot.
--
-- This migration replaces the view with a real `public_profiles` table
-- that holds ONLY the public-safe projection, kept in sync with
-- `profiles` via an AFTER trigger. Standard "authenticated can SELECT"
-- RLS now works without any privilege escalation: the public_profiles
-- row has no private columns to leak.
--
-- Drift safety: the trigger fires on INSERT and UPDATE of the source
-- columns. DELETE on profiles cascades through the foreign key. A
-- one-shot backfill at the bottom of this migration covers existing
-- rows.

-- 1. Drop the old SECURITY DEFINER view + any dependent objects we
--    created alongside it. The username index stays — it's on
--    profiles directly and still useful.
DROP VIEW IF EXISTS public.public_profiles;

-- 2. Create the synced table.
CREATE TABLE IF NOT EXISTS public.public_profiles (
  id            UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  username      TEXT,
  display_name  TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.public_profiles IS
  'Public-safe projection of profiles for community attribution. '
  'Kept in sync via trigger sync_public_profiles_from_profiles. '
  'NEVER add email, first/last name, dob, gender, height/weight, '
  'subscription_tier, is_pro, is_plus, or any medical-profile field. '
  'The base `profiles` table stays self-only RLS.';

-- 3. RLS — every authenticated user can read every row. No write
--    policies means only service_role can mutate, which is what the
--    sync trigger uses (SECURITY DEFINER, owner = postgres).
ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles readable by authenticated" ON public.public_profiles;
CREATE POLICY "Public profiles readable by authenticated"
  ON public.public_profiles
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.public_profiles FROM PUBLIC;
REVOKE ALL ON public.public_profiles FROM anon;
GRANT SELECT ON public.public_profiles TO authenticated;

-- Username search index — same purpose as the one we created on
-- profiles in the original migration, but now on the public table so
-- queries don't have to round-trip through the private table.
CREATE INDEX IF NOT EXISTS idx_public_profiles_username_lower
  ON public.public_profiles (lower(username))
  WHERE username IS NOT NULL;

-- 4. Sync trigger — keeps public_profiles aligned with profiles.
CREATE OR REPLACE FUNCTION public.sync_public_profiles_from_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- ON DELETE CASCADE handles this, but keep the branch in case a
    -- future maintainer drops the FK.
    DELETE FROM public.public_profiles WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.public_profiles (id, username, display_name, avatar_url, created_at, updated_at)
  VALUES (NEW.id, NEW.username, NEW.display_name, NEW.avatar_url, NEW.created_at, NOW())
  ON CONFLICT (id) DO UPDATE
    SET username     = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        avatar_url   = EXCLUDED.avatar_url,
        created_at   = EXCLUDED.created_at,
        updated_at   = NOW();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_public_profiles_from_profiles() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_public_profiles ON public.profiles;
CREATE TRIGGER trg_sync_public_profiles
  AFTER INSERT OR UPDATE OF username, display_name, avatar_url
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_public_profiles_from_profiles();

-- 5. Backfill — copy every existing profile row into the new table
--    so the community feed has attribution from t=0. ON CONFLICT
--    keeps this migration idempotent.
INSERT INTO public.public_profiles (id, username, display_name, avatar_url, created_at, updated_at)
SELECT id, username, display_name, avatar_url, created_at, NOW()
FROM public.profiles
ON CONFLICT (id) DO UPDATE
  SET username     = EXCLUDED.username,
      display_name = EXCLUDED.display_name,
      avatar_url   = EXCLUDED.avatar_url,
      created_at   = EXCLUDED.created_at,
      updated_at   = NOW();
