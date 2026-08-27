-- Durable evidence for every purchase-validation attempt.
--
-- THE GAP THIS CLOSES
-- A customer bought PepTalk Plus on Google Play on 2026-08-22. Money left her
-- account. She then signed in and out repeatedly and stayed on the free tier.
-- When we went looking for what happened, there was nothing to look at: no
-- subscription row, no subscription_event, no log line, no trace of any kind.
-- The only reason we know she exists is that she sent an Instagram message.
--
-- That is the actual defect. Not the missing Play notification -- the fact
-- that a failure on the money path leaves NO RECORD, so it is unfindable and
-- uncountable. Every other Android buyer in the same position is still
-- invisible to us today.
--
-- WHAT THIS DOES
-- One row per validation attempt, written BEFORE verification is attempted and
-- updated as the attempt progresses. If the function crashes, times out, or
-- the database write later fails, the row survives at whatever stage it
-- reached, naming the user and the product. Reconciliation then has something
-- to work from, and "how many customers are affected" becomes a query instead
-- of a guess.
--
-- WHY NOT JUST LOG
-- Edge function logs roll off, cannot be joined against subscriptions, and
-- cannot be swept by a scheduled job. Evidence that cannot be queried is not
-- evidence.

CREATE TABLE IF NOT EXISTS public.purchase_validation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  product_id TEXT NOT NULL,

  /*
   * How far the attempt got. The whole point is that a row exists even at
   * 'received', because that is the state a crash leaves behind.
   *
   *   received      -- request accepted, nothing verified yet
   *   verified      -- the store confirmed the purchase is real
   *   verify_failed -- the store rejected it (no money owed)
   *   granted       -- entitlement written; the happy path ends here
   *   grant_failed  -- VERIFIED BUT NOT GRANTED. money taken, nothing given.
   *                    this is the state that needs a human or a sweep.
   *   duplicate_user-- the transaction already belongs to another account
   */
  stage TEXT NOT NULL DEFAULT 'received',

  /* Store-side identity, for reconciliation against Play/ASC order reports. */
  external_id TEXT,
  /* Needed to re-query the store during reconciliation. Never leaves the server. */
  purchase_token TEXT,

  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

/* The reconciliation query: verified but never granted, oldest first. */
CREATE INDEX IF NOT EXISTS idx_pvl_needs_attention
  ON public.purchase_validation_log (stage, created_at)
  WHERE stage IN ('verified', 'grant_failed');

CREATE INDEX IF NOT EXISTS idx_pvl_user ON public.purchase_validation_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvl_external ON public.purchase_validation_log (platform, external_id);

ALTER TABLE public.purchase_validation_log ENABLE ROW LEVEL SECURITY;

/*
 * No client policy of any kind -- not even read-own.
 *
 * These rows carry purchase tokens, which are bearer credentials for the
 * store APIs: anyone holding one can query and acknowledge that purchase.
 * RLS with zero policies denies every client, and the service role bypasses
 * RLS, so the edge functions still work.
 */

/*
 * Record an attempt, or advance an existing one.
 *
 * Keyed on (platform, external_id) once an identity is known so a retry
 * updates the same row rather than accumulating duplicates -- a customer
 * whose app retries twenty times should be one row with attempts=20, not
 * twenty rows that make the problem look twenty times bigger.
 */
CREATE OR REPLACE FUNCTION public.log_purchase_validation(
  p_user_id UUID,
  p_platform TEXT,
  p_product_id TEXT,
  p_stage TEXT,
  p_external_id TEXT DEFAULT NULL,
  p_purchase_token TEXT DEFAULT NULL,
  p_acknowledged BOOLEAN DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_external_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.purchase_validation_log
     WHERE platform = p_platform AND external_id = p_external_id
     ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.purchase_validation_log
      (user_id, platform, product_id, stage, external_id, purchase_token,
       acknowledged, error)
    VALUES
      (p_user_id, p_platform, p_product_id, p_stage, p_external_id,
       p_purchase_token, COALESCE(p_acknowledged, FALSE), LEFT(p_error, 500))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.purchase_validation_log
       SET stage = p_stage,
           user_id = COALESCE(p_user_id, user_id),
           purchase_token = COALESCE(p_purchase_token, purchase_token),
           acknowledged = COALESCE(p_acknowledged, acknowledged),
           -- Keep the first error rather than overwriting it with a later,
           -- less informative one.
           error = COALESCE(error, LEFT(p_error, 500)),
           attempts = attempts + 1,
           updated_at = NOW()
     WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_purchase_validation(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_purchase_validation(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT)
  TO service_role;
