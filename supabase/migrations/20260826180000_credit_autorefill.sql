-- Opt-in automatic credit top-up, WEB ONLY.
--
-- WHY WEB ONLY
-- Apple and Google both require the user to confirm every consumable purchase;
-- neither has an auto-recharge primitive for one-time products. The only
-- auto-charging product type on those stores is an auto-renewable
-- subscription, which bills monthly whether or not the credit ran out -- a
-- different product from "refill when empty". On the web we own the payment
-- relationship, so a merchant-initiated charge against a saved card is
-- legitimate and is what this table gates.
--
-- MONEY-SENSITIVE. This authorises charging a stored card without the customer
-- present, so the design is deliberately conservative:
--
--   * OFF by default. A row only exists once someone opts in.
--   * Hard cap per calendar month. A bug that loops cannot drain a card --
--     it can spend at most refills_per_month x price.
--   * Auto-disables after repeated failures rather than retrying forever
--     against a declined card.
--   * Every charge is still recorded in ai_credit_grants with the Square
--     payment id, so the existing (source, external_id) unique constraint
--     makes a double-charge impossible even if the caller retries.
--
-- No Square ids are stored here. The customer is looked up by
-- reference_id = user id (the same key square-subscribe sets) and the card is
-- read from Square at charge time, so a card the user removes in Square simply
-- stops working rather than leaving a stale id behind.

CREATE TABLE IF NOT EXISTS public.ai_credit_autorefill (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Top up when the balance falls below this. Microcents.
  threshold_microcents BIGINT NOT NULL DEFAULT 50000000 CHECK (threshold_microcents >= 0),
  -- Ceiling on automatic spend. The single most important safety property here.
  max_per_month INTEGER NOT NULL DEFAULT 4 CHECK (max_per_month BETWEEN 1 AND 20),
  -- Rolling counters, reset when the month changes.
  period_start DATE,
  refills_this_period INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_refill_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_credit_autorefill ENABLE ROW LEVEL SECURITY;

-- The user may read their own setting and turn it on or off. They may NOT
-- edit the counters or the cap -- those are the safety limits, so they are
-- maintained by the SECURITY DEFINER function below and re-asserted on write.
DROP POLICY IF EXISTS "Read own autorefill" ON public.ai_credit_autorefill;
CREATE POLICY "Read own autorefill" ON public.ai_credit_autorefill
  FOR SELECT USING (auth.uid() = user_id);

/**
 * Claim one refill slot, atomically.
 *
 * Returns TRUE only if this call is allowed to charge. Everything that could
 * permit a second concurrent charge is decided inside one locked statement:
 * the monthly counter is reset on a period change, the cap is compared, and
 * the counter is incremented -- all before any money moves. The caller charges
 * only on TRUE, and calls record_autorefill_result afterwards either way.
 */
CREATE OR REPLACE FUNCTION public.claim_autorefill_slot(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ai_credit_autorefill%ROWTYPE;
  v_month DATE := date_trunc('month', NOW())::DATE;
BEGIN
  SELECT * INTO v_row FROM public.ai_credit_autorefill
   WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND OR NOT v_row.enabled THEN
    RETURN FALSE;
  END IF;

  -- Repeated declines disable the feature rather than retrying forever.
  IF v_row.consecutive_failures >= 3 THEN
    RETURN FALSE;
  END IF;

  -- New month resets the allowance.
  IF v_row.period_start IS DISTINCT FROM v_month THEN
    UPDATE public.ai_credit_autorefill
       SET period_start = v_month, refills_this_period = 0, updated_at = NOW()
     WHERE user_id = p_user_id;
    v_row.refills_this_period := 0;
  END IF;

  IF v_row.refills_this_period >= v_row.max_per_month THEN
    RETURN FALSE;
  END IF;

  -- Claim the slot BEFORE charging. If the charge then fails the slot is
  -- returned by record_autorefill_result; erring toward one lost slot is far
  -- better than erring toward one extra charge.
  UPDATE public.ai_credit_autorefill
     SET refills_this_period = refills_this_period + 1, updated_at = NOW()
   WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$;

/** Record the outcome. On failure the slot is handed back and the failure
 *  counter advances; three in a row stops further attempts. */
CREATE OR REPLACE FUNCTION public.record_autorefill_result(
  p_user_id UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_success THEN
    UPDATE public.ai_credit_autorefill
       SET consecutive_failures = 0, last_refill_at = NOW(),
           last_error = NULL, updated_at = NOW()
     WHERE user_id = p_user_id;
  ELSE
    UPDATE public.ai_credit_autorefill
       SET consecutive_failures = consecutive_failures + 1,
           refills_this_period = GREATEST(0, refills_this_period - 1),
           last_error = LEFT(COALESCE(p_error, 'unknown'), 300),
           updated_at = NOW()
     WHERE user_id = p_user_id;
  END IF;
END;
$$;

/** Turn auto-refill on or off. The only knob a client may touch, and it
 *  cannot raise the cap or clear the failure counter. */
CREATE OR REPLACE FUNCTION public.set_autorefill_enabled(
  p_user_id UUID,
  p_enabled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_credit_autorefill AS a (user_id, enabled, period_start)
  VALUES (p_user_id, p_enabled, date_trunc('month', NOW())::DATE)
  ON CONFLICT (user_id) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        -- Turning it back on clears a previous decline streak, since the user
        -- has presumably fixed the card.
        consecutive_failures = CASE WHEN EXCLUDED.enabled THEN 0 ELSE a.consecutive_failures END,
        updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.claim_autorefill_slot(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_autorefill_result(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_autorefill_enabled(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_autorefill_slot(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_autorefill_result(UUID, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_autorefill_enabled(UUID, BOOLEAN) TO service_role;
