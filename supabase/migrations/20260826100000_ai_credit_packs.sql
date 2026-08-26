-- AI credit packs — purchased top-ups that extend the monthly AI allowance.
--
-- MONEY-ADJACENT. Two failure modes drive every choice below:
--
--   1. Granting twice. Store webhooks and receipt validations RETRY by design:
--      Square resends until it gets a 2xx, Apple/Google receipts can be
--      replayed by a client. So the grant is keyed on (source, external_id)
--      with a UNIQUE constraint, and the balance only moves when that INSERT
--      actually inserts. Idempotency is enforced by the database, not by a
--      caller remembering to check first.
--
--   2. Spending twice, or below zero. Consumption is a single atomic UPDATE
--      with a floor, returning what it actually took -- never a read, then a
--      write.
--
-- Balances are in MICROCENTS (1 cent = 1,000,000 mc), the same unit
-- aimee-chat-stream/_cost.ts already records spend in, so no conversion exists
-- to drift.
--
-- Additive only: two new tables and two new functions. Nothing existing is
-- altered, and no rows are written by this migration.

CREATE TABLE IF NOT EXISTS public.ai_credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'apple' | 'google' | 'square' | 'manual'
  source TEXT NOT NULL,
  -- Apple transactionId, Google orderId, Square payment id, or an operator ref.
  external_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  microcents BIGINT NOT NULL CHECK (microcents > 0),
  price_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One grant per underlying transaction, per rail. This is THE idempotency
  -- guarantee; every grant path relies on it rather than on its own check.
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_grants_user
  ON public.ai_credit_grants(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_credit_balance (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Never negative: consumption floors at zero rather than going into debt.
  balance_microcents BIGINT NOT NULL DEFAULT 0 CHECK (balance_microcents >= 0),
  lifetime_granted_microcents BIGINT NOT NULL DEFAULT 0,
  lifetime_spent_microcents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_balance ENABLE ROW LEVEL SECURITY;

-- Users may READ their own credit history and balance -- they paid for it and
-- it must be visible. Nobody may write from the client: every mutation goes
-- through the SECURITY DEFINER functions below, called by verified server
-- paths only. No INSERT/UPDATE/DELETE policy exists for authenticated, which
-- means those are denied.
DROP POLICY IF EXISTS "Read own credit grants" ON public.ai_credit_grants;
CREATE POLICY "Read own credit grants" ON public.ai_credit_grants
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Read own credit balance" ON public.ai_credit_balance;
CREATE POLICY "Read own credit balance" ON public.ai_credit_balance
  FOR SELECT USING (auth.uid() = user_id);

-- Grant credits for a verified purchase.
--
-- Returns the balance after the call and whether this was a duplicate. A
-- duplicate is a SUCCESS, not an error: a webhook retry must be able to call
-- this and get a 2xx, or the store keeps retrying forever. The caller can tell
-- the difference from `was_duplicate` for logging.
CREATE OR REPLACE FUNCTION public.grant_ai_credits(
  p_user_id UUID,
  p_source TEXT,
  p_external_id TEXT,
  p_product_id TEXT,
  p_microcents BIGINT,
  p_price_cents INTEGER DEFAULT NULL
)
RETURNS TABLE (balance_microcents BIGINT, was_duplicate BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ROW_COUNT is an integer; GET DIAGNOSTICS into a BOOLEAN does not do what
  -- it looks like it does.
  v_rows INTEGER := 0;
  v_balance BIGINT;
BEGIN
  IF p_microcents IS NULL OR p_microcents <= 0 THEN
    RAISE EXCEPTION 'grant_ai_credits: microcents must be positive, got %', p_microcents;
  END IF;

  INSERT INTO public.ai_credit_grants (
    user_id, source, external_id, product_id, microcents, price_cents
  )
  VALUES (
    p_user_id, p_source, p_external_id, p_product_id, p_microcents, p_price_cents
  )
  ON CONFLICT (source, external_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    INSERT INTO public.ai_credit_balance AS b (
      user_id, balance_microcents, lifetime_granted_microcents, updated_at
    )
    VALUES (p_user_id, p_microcents, p_microcents, NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET balance_microcents = b.balance_microcents + EXCLUDED.balance_microcents,
          lifetime_granted_microcents =
            b.lifetime_granted_microcents + EXCLUDED.lifetime_granted_microcents,
          updated_at = NOW();
  END IF;

  SELECT b.balance_microcents INTO v_balance
    FROM public.ai_credit_balance b WHERE b.user_id = p_user_id;

  RETURN QUERY SELECT COALESCE(v_balance, 0::BIGINT), (v_rows = 0);
END;
$$;

-- Draw down credits, atomically, never below zero.
--
-- Returns how much was ACTUALLY consumed, which may be less than requested
-- when the balance is short. Callers must use the returned figure rather than
-- assuming the full amount came out.
CREATE OR REPLACE FUNCTION public.consume_ai_credits(
  p_user_id UUID,
  p_microcents BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal   BIGINT;
  v_taken BIGINT;
BEGIN
  IF p_microcents IS NULL OR p_microcents <= 0 THEN
    RETURN 0;
  END IF;

  -- FOR UPDATE locks the row for the rest of the transaction, so two
  -- concurrent turns serialise here instead of both reading the same balance
  -- and each spending it. The read-then-write below is therefore atomic.
  SELECT b.balance_microcents INTO v_bal
    FROM public.ai_credit_balance b
   WHERE b.user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Take what is there, never more. An earlier draft computed this in a
  -- RETURNING clause, where column references yield POST-update values, so a
  -- short balance reported the full requested amount as consumed.
  v_taken := LEAST(v_bal, p_microcents);
  IF v_taken <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.ai_credit_balance
     SET balance_microcents = balance_microcents - v_taken,
         lifetime_spent_microcents = lifetime_spent_microcents + v_taken,
         updated_at = NOW()
   WHERE user_id = p_user_id;

  RETURN v_taken;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_ai_credits(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_ai_credits(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_ai_credits(UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(UUID, BIGINT) TO service_role;
