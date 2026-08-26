-- SECURITY: take EXECUTE on the credit functions away from anon/authenticated.
--
-- WHAT WENT WRONG
-- 20260826100000 ended with:
--   REVOKE ALL ON FUNCTION public.grant_ai_credits(...) FROM PUBLIC;
--   GRANT EXECUTE ... TO service_role;
-- and that looked sufficient. It was not. Supabase ships ALTER DEFAULT
-- PRIVILEGES that grant EXECUTE on every new function in `public` to the
-- `anon` and `authenticated` roles. Those are EXPLICIT role grants, and
-- REVOKE ... FROM PUBLIC does not remove them -- PUBLIC is a different grantee.
--
-- The result, verified by probing the live REST endpoint with only the anon
-- key: an anonymous caller could invoke grant_ai_credits. It is SECURITY
-- DEFINER, so it ran as the owner and bypassed RLS entirely. The single thing
-- that stopped the probe was a foreign-key error on a made-up user id; with a
-- real one, anybody holding the public anon key -- which ships in the web
-- bundle -- could have granted themselves unlimited AI credit.
--
-- HOW IT WAS FOUND
-- Not by reading the migration, which looked right. By calling the endpoint as
-- an anonymous user and reading the response. The pre-existing bump_ai_usage
-- has the correct ACL (postgres + service_role only), which is what this
-- restores these two to.
--
-- These functions are only ever called by edge functions using the service
-- role key. No client path calls them, so this removes no capability.

REVOKE ALL ON FUNCTION public.grant_ai_credits(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_ai_credits(UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.grant_ai_credits(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(UUID, BIGINT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Two pre-existing instances of the SAME mistake, found by the same probe.
--
-- purge_expired_aimee_pending_actions has carried
--   REVOKE ALL ON FUNCTION ... FROM PUBLIC;
-- since 20260517000002 and has been anon-callable that entire time, for
-- exactly the reason above. Severity is LOW -- it deletes only rows whose
-- expires_at has already passed, so there is no data loss and nothing is
-- disclosed; the objection is that a maintenance routine should not be
-- reachable with the public anon key at all.
--
-- _apply_user_id_rls runs with INVOKER rights, so as anon it has no privilege
-- to do anything; locked for tidiness rather than because it is dangerous.
--
-- Neither has a caller outside migrations and ops.
REVOKE ALL ON FUNCTION public.purge_expired_aimee_pending_actions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_aimee_pending_actions()
  TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_apply_user_id_rls'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public._apply_user_id_rls(text) FROM PUBLIC, anon, authenticated';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '_apply_user_id_rls revoke skipped: %', SQLERRM;
END $$;
