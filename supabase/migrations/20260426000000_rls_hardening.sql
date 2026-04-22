-- ============================================================================
-- RLS hardening + server-side trust boundaries (2026-04-26)
--
-- Fixes three latent issues in the original RLS setup that a motivated user
-- could exploit to self-grant a paid tier:
--
--   1. `subscriptions` table had user-level INSERT/UPDATE — a user could POST
--      to /rest/v1/subscriptions with their own JWT and `tier='pro'` and
--      bypass validate-purchase entirely.
--
--   2. `profiles.subscription_tier` + `is_pro` were mutable by the owner via
--      the UPDATE policy — same self-grant attack vector at the profile
--      level (which the client also reads on login).
--
--   3. `chat_messages.created_at` accepted client-sent timestamps, which
--      broke the authority of the daily-quota window query (user could
--      rewrite their system clock to backdate messages).
--
-- Also reasserts RLS across every PII-bearing table via the existing
-- `_apply_user_id_rls` helper as a safety net in case anyone toggles it
-- off via the Supabase dashboard.
--
-- Safe to re-run.
-- ============================================================================


-- ── 1. subscriptions: readable by owner, writable only by service_role ─────

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own rows select" ON public.subscriptions;
DROP POLICY IF EXISTS "Own rows insert" ON public.subscriptions;
DROP POLICY IF EXISTS "Own rows update" ON public.subscriptions;
DROP POLICY IF EXISTS "Own rows delete" ON public.subscriptions;

-- The only operation authenticated users need is SELECT — reading their
-- own row via useSubscriptionStore.syncFromServer. All mutations have to
-- go through the validate-purchase edge function, which runs as
-- service_role and therefore bypasses RLS.
CREATE POLICY "Read own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);


-- ── 2. Lock profiles.subscription_tier / is_pro from user writes ───────────

-- RLS can gate rows, not columns. To keep the convenience of letting users
-- update their own profile (name, avatar, etc.) while forbidding them from
-- granting themselves Pro, we use a BEFORE UPDATE trigger that reverts the
-- two security-critical columns to their previous values when the caller
-- is NOT the service_role.
CREATE OR REPLACE FUNCTION public.profiles_protect_tier_columns()
RETURNS TRIGGER AS $$
DECLARE
  is_service_role BOOLEAN;
BEGIN
  -- auth.role() returns 'service_role' when the request uses the service
  -- role key, 'authenticated' for a normal signed-in user, 'anon' for
  -- unauthenticated. Only service_role is allowed to change tier fields.
  is_service_role := coalesce(auth.role(), '') = 'service_role';

  IF is_service_role THEN
    RETURN NEW;
  END IF;

  -- Revert any attempt to tamper with subscription gating.
  NEW.subscription_tier := OLD.subscription_tier;
  NEW.is_pro := OLD.is_pro;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_protect_tier ON public.profiles;
CREATE TRIGGER profiles_protect_tier
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_tier_columns();


-- ── 3. Pin chat_messages.created_at to server time ─────────────────────────

-- A user could mess with their device clock to backdate messages and slip
-- past the rolling-24h quota window. A BEFORE INSERT trigger forces the
-- column to now() unconditionally when the caller is not service_role
-- (service_role can still set arbitrary timestamps for backfills / seeds).
CREATE OR REPLACE FUNCTION public.chat_messages_pin_created_at()
RETURNS TRIGGER AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    NEW.created_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS chat_messages_server_timestamp ON public.chat_messages;
CREATE TRIGGER chat_messages_server_timestamp
  BEFORE INSERT OR UPDATE OF created_at ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_messages_pin_created_at();


-- ── 4. RLS coverage sanity check ───────────────────────────────────────────

-- Re-assert RLS on every user-data table in case someone disables it via
-- the dashboard. Idempotent — the _apply_user_id_rls helper drops and
-- re-creates policies each time.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = '_apply_user_id_rls') THEN
    PERFORM public._apply_user_id_rls('check_ins');
    PERFORM public._apply_user_id_rls('dose_logs');
    PERFORM public._apply_user_id_rls('active_protocols');
    PERFORM public._apply_user_id_rls('meal_entries');
    PERFORM public._apply_user_id_rls('workout_logs');
    PERFORM public._apply_user_id_rls('chat_messages');
    PERFORM public._apply_user_id_rls('journal_entries');
    PERFORM public._apply_user_id_rls('saved_stacks');
    PERFORM public._apply_user_id_rls('health_profiles');
    PERFORM public._apply_user_id_rls('injection_sites');
    PERFORM public._apply_user_id_rls('pantry_items');
    PERFORM public._apply_user_id_rls('cycle_period_entries');
    PERFORM public._apply_user_id_rls('cycle_day_logs');
    PERFORM public._apply_user_id_rls('contraception_history');
    PERFORM public._apply_user_id_rls('connected_integrations');
    PERFORM public._apply_user_id_rls('allergen_entries');
  END IF;
END $$;


-- ── Verification query (uncomment to run after deploy) ─────────────────────
-- SELECT tablename,
--        rowsecurity AS rls_enabled,
--        (SELECT count(*) FROM pg_policies WHERE pg_policies.tablename = t.tablename) AS policy_count
--   FROM pg_tables t
--  WHERE schemaname = 'public'
--  ORDER BY tablename;
