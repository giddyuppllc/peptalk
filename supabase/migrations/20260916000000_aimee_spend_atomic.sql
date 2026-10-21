-- ─────────────────────────────────────────────────────────────────────────
-- Atomic monthly-spend increment for aimee_cost_cents
-- ─────────────────────────────────────────────────────────────────────────
--
-- Same defect as 20260521000000_ai_usage_atomic.sql, on the other ledger.
-- `recordSpend` in supabase/functions/aimee-chat-stream/_cost.ts did:
--
--   SELECT spend_microcents, call_count FROM aimee_cost_cents WHERE ...
--   UPSERT spend_microcents = <read value> + delta, call_count = <read> + 1
--
-- Two writes that overlap both read the same "before" value and both write
-- before+delta, so one of them is lost. Measured on an in-memory table with
-- the module's own code: ten concurrent calls recorded ONE call's spend.
--
-- This matters more than it did in May. Every AI edge function now records
-- into this table (supabase/functions/_shared/aiAllowance.ts), and the global
-- sentinel row (user_id 00000000-0000-0000-0000-000000000000) is written by
-- EVERY AI call from EVERY user — the single hottest row in the schema, and
-- the one the AIMEE_MONTHLY_BUDGET_CENTS runaway breaker reads. A breaker
-- that undercounts by ~10x is not a breaker.
--
-- Fix, mirroring bump_ai_usage: one INSERT ... ON CONFLICT DO UPDATE, so
-- Postgres takes the row lock and the addition happens inside it. Returns the
-- POST-increment total so a caller can report the true running spend.
--
-- SCHEMA-ADDITIVE. Creates a function; touches no rows, no columns, no
-- constraint. There is no backfill: the spend already lost to the race is not
-- reconstructable, and inventing numbers into a money ledger would be worse
-- than the undercount.

CREATE OR REPLACE FUNCTION public.bump_aimee_spend(
  p_user_id UUID,
  p_date DATE,
  p_microcents BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
-- Empty search_path: every object below is schema-qualified, so nothing
-- resolves through a caller-controlled path.
SET search_path = ''
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  INSERT INTO public.aimee_cost_cents (user_id, date, spend_microcents, call_count, last_called_at)
  VALUES (p_user_id, p_date, p_microcents, 1, now())
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    spend_microcents = public.aimee_cost_cents.spend_microcents + p_microcents,
    call_count = public.aimee_cost_cents.call_count + 1,
    last_called_at = now()
  RETURNING public.aimee_cost_cents.spend_microcents INTO v_total;

  RETURN v_total;
END;
$$;

-- Grants, named explicitly.
--
-- `REVOKE ... FROM PUBLIC` alone does NOT make a function unreachable on
-- Supabase: ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function in
-- `public` to `anon` and `authenticated`, and those are grants to NAMED roles
-- that a revoke from PUBLIC does not touch. That is how `grant_ai_credits`
-- stayed anon-callable (see scripts/verify-rpc-grants.mjs). This function
-- writes a spend ledger, so it is service-role only: naming all three
-- grantees is the difference between a revoke that works and one that reports
-- success and changes nothing.
REVOKE ALL ON FUNCTION public.bump_aimee_spend(UUID, DATE, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_aimee_spend(UUID, DATE, BIGINT) FROM anon;
REVOKE ALL ON FUNCTION public.bump_aimee_spend(UUID, DATE, BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bump_aimee_spend(UUID, DATE, BIGINT) TO service_role;

COMMENT ON FUNCTION public.bump_aimee_spend IS
  'Atomic per-user/per-date spend increment for aimee_cost_cents, in '
  'microcents. Returns the POST-increment total. Replaces the '
  'read-modify-write in recordSpend (_cost.ts), which lost concurrent '
  'increments on both the user row and the global sentinel row.';
