-- ============================================================================
-- Record which Apple/Google environment a subscription came from.
--
-- WHY
-- Apple delivers BOTH Sandbox and Production App Store Server Notifications to
-- the same production URL. apple-notifications verifies the JWS signature and
-- checks the bundle id — but never read `data.environment`, so a Sandbox
-- notification was indistinguishable from a real purchase and granted a real
-- entitlement. Anyone with a sandbox tester account on this bundle id could
-- hand themselves Pro, and sandbox activity silently mixed into real
-- subscription state.
--
-- WHAT THIS DOES *NOT* DO
-- It does not block sandbox notifications. App Review performs its purchases in
-- SANDBOX against the production build, so refusing them would fail review —
-- the exact outcome we are trying to avoid. This migration makes the
-- distinction VISIBLE and queryable; whether a sandbox entitlement should
-- confer real access is a policy decision for Edward, and is deliberately left
-- unchanged here.
--
-- Nullable with no default on purpose: NULL means "recorded before we captured
-- this", which is honest, rather than back-dating every existing row to
-- 'Production' as if we had checked.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS environment;
--   ALTER TABLE public.subscription_events DROP COLUMN IF EXISTS environment;
-- ============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS environment TEXT;

ALTER TABLE public.subscription_events
  ADD COLUMN IF NOT EXISTS environment TEXT;

COMMENT ON COLUMN public.subscriptions.environment IS
  'Apple/Google environment the entitlement came from: Sandbox | Production | NULL (pre-dates capture). Sandbox rows are NOT real revenue.';
