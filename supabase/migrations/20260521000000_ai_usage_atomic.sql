-- ─────────────────────────────────────────────────────────────────────────
-- Wave 76.11 — atomic rate-limit increment for ai_usage_log
-- ─────────────────────────────────────────────────────────────────────────
--
-- Problem (P1 from Wave 76.10 schema audit): the rate-limit path in
-- supabase/functions/aimee-chat-stream/index.ts uses read-modify-write:
--
--   SELECT count FROM ai_usage_log WHERE ...   -- e.g. returns 9
--   if (count >= limit) deny
--   UPSERT count + 1
--
-- Under concurrent calls from the same user (double-tap, retry storm,
-- TanStack-style refetch), two parallel calls both read count=9, both
-- pass the limit check, both write count=10. One increment lost, and
-- a tier-25 user squeezes a 26th message past the gate. With Pro at
-- $0.50/output-1M-tokens via Grok, this is real money.
--
-- Fix: a SECURITY DEFINER function that does INSERT ... ON CONFLICT
-- DO UPDATE RETURNING count, in one statement. Postgres serializes
-- the row-level lock; the count returned is the post-increment value.
-- Caller compares against the limit AFTER the bump, denies on the
-- 26th request, and refunds via DELETE if needed.

CREATE OR REPLACE FUNCTION public.bump_ai_usage(
  p_user_id UUID,
  p_function_name TEXT,
  p_date DATE
)
RETURNS TABLE (count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.ai_usage_log (user_id, function_name, date, count, last_called_at)
  VALUES (p_user_id, p_function_name, p_date, 1, now())
  ON CONFLICT (user_id, function_name, date)
  DO UPDATE SET
    count = ai_usage_log.count + 1,
    last_called_at = now()
  RETURNING ai_usage_log.count;
END;
$$;

-- Service-role-only callers (edge functions). Authenticated callers
-- have no business touching the rate-limit ledger directly.
REVOKE ALL ON FUNCTION public.bump_ai_usage(UUID, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_ai_usage(UUID, TEXT, DATE) FROM anon;
REVOKE ALL ON FUNCTION public.bump_ai_usage(UUID, TEXT, DATE) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bump_ai_usage(UUID, TEXT, DATE) TO service_role;

COMMENT ON FUNCTION public.bump_ai_usage IS
  'Atomic per-user/per-function/per-date rate-limit counter. '
  'Returns the POST-increment count; caller compares against the '
  'tier limit and denies if exceeded. Replace the read-modify-write '
  'pattern in edge functions with a single RPC call to this.';
