-- ─────────────────────────────────────────────────────────────────────────
-- Wave 76.11 — public profile view for community feed attribution
-- ─────────────────────────────────────────────────────────────────────────
--
-- Problem (P1 from Wave 76.10 schema audit): the `profiles` table has
-- only a self-only SELECT policy. Every community-feed embed
-- `profiles:user_id (...)` returns NULL for all rows except the
-- caller's, so post-author names + avatars never render. Either prod
-- has an undocumented permissive `USING (true)` policy on the whole
-- table (PII leak), or the community feed has been quietly broken
-- since launch.
--
-- Fix: ship a SECURITY DEFINER view (the Postgres default for views
-- created in pre-15-style — runs with the owner's privileges and
-- BYPASSES the underlying RLS for the columns the view selects).
-- The view's SELECT list is the ONLY way to expose data from
-- `profiles` to other authenticated users — never email, tier,
-- demographics, or medical fields. The base table stays self-only.
--
-- Why a view (not a separate table): single source of truth for
-- profile data. Edits to display_name etc. land in `profiles` and
-- show up through the view immediately. No dual-write churn.

-- 1. The view — explicit security_invoker=false so it runs as the
--    creating role (supabase admin / postgres), bypassing the base
--    table's self-only RLS for the public-safe columns we project.
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  id,
  username,
  display_name,
  avatar_url,
  created_at
FROM public.profiles;

-- 2. Lock down access:
--    - authenticated may SELECT (community is auth-gated; the view
--      is the canonical way to fetch author cards)
--    - anon may NOT (no value in leaking usernames to anyone with
--      just the project anon key)
GRANT SELECT ON public.public_profiles TO authenticated;
REVOKE ALL ON public.public_profiles FROM anon;
REVOKE ALL ON public.public_profiles FROM PUBLIC;

-- 3. Username search index — community @-mention autocomplete + the
--    upcoming follow-suggest flow will both LOWER(username) match.
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- 4. Comment on the view so future readers know it's the public
--    surface and what NOT to add to the SELECT list.
COMMENT ON VIEW public.public_profiles IS
  'Public-safe projection of profiles for community attribution. '
  'NEVER add email, first/last name, dob, gender, height/weight, '
  'subscription_tier, is_pro, is_plus, or any medical-profile field '
  'to the SELECT list. The base `profiles` table stays self-only RLS.';
