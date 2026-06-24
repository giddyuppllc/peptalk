-- The apple-notifications webhook updates profiles.is_plus on renewals/refunds/
-- expiry, but is_plus was never added to public.profiles. PostgREST rejects an
-- UPDATE naming an unknown column with a 400, so the ENTIRE update failed and
-- was swallowed — meaning renewal/refund/expiry events never propagated to the
-- tier mirror (refunded users kept Pro; webhook upgrades never landed). Add the
-- column so the existing write succeeds. Additive + idempotent — nothing removed.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_plus boolean NOT NULL DEFAULT false;

-- Keep is_plus consistent with the existing tier mirror for current rows.
UPDATE public.profiles
   SET is_plus = (subscription_tier = 'plus')
 WHERE is_plus <> (subscription_tier = 'plus');
