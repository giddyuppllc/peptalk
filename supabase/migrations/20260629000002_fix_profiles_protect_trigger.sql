-- P1 fix — profiles_protect_tier_columns() referenced phantom columns.
--
-- The active definition (20260524000000_admin_tier_management.sql) reverted
-- subscription_tier, subscription_started_at, and subscription_expires_at in
-- its non-privileged branch. But public.profiles never had
-- subscription_started_at / subscription_expires_at — those columns do not
-- exist (initial_schema created subscription_tier + is_pro; is_plus was added
-- in 20260624020000). PL/pgSQL resolves NEW.<field> at runtime, so for ANY
-- non-privileged (authenticated/anon) caller this BEFORE UPDATE trigger raised
--   record "new" has no field "subscription_started_at"
-- and aborted the UPDATE. Because the client writes (setAvatar -> avatar_url,
-- toggleFavoritePeptide -> favorite_peptides, share_anonymized_data) are
-- fire-and-forget, the error was swallowed and those writes never persisted.
-- Service-role writes were unaffected (privileged branch returns early), which
-- is why tier resolution still worked.
--
-- Fix: CREATE OR REPLACE the function with the SAME privileged-branch logic and
-- trigger wiring, but the non-privileged branch reverts only columns that
-- actually exist — the security-critical subscription-gating columns:
--   subscription_tier, is_pro, is_plus
-- This also restores the original anti-self-grant protection on is_pro (which
-- the 20260524 version had silently dropped) and extends it to is_plus.
--
-- The existing trigger (profiles_protect_tier on public.profiles, from
-- 20260426000000_rls_hardening) is left in place — CREATE OR REPLACE FUNCTION
-- rebinds it automatically, no DROP/CREATE TRIGGER needed.
--
-- ROLLBACK: re-run the function body from
-- 20260524000000_admin_tier_management.sql (lines 24-43) to restore the prior
-- (broken) definition.

CREATE OR REPLACE FUNCTION public.profiles_protect_tier_columns()
RETURNS TRIGGER AS $$
DECLARE
  is_privileged BOOLEAN;
BEGIN
  is_privileged :=
       coalesce(auth.role(), '') = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin');

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Anyone else gets their subscription-gating tampering reverted. Only
  -- columns that exist on public.profiles are referenced here.
  NEW.subscription_tier := OLD.subscription_tier;
  NEW.is_pro := OLD.is_pro;
  NEW.is_plus := OLD.is_plus;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
