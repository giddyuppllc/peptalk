-- ============================================================================
-- Track whether the welcome email has been sent.
--
-- Guards send-welcome-email against duplicates. The function claims the send by
-- setting this column with an `is null` predicate BEFORE dispatching, so two
-- rapid calls cannot both read null and both send. On a send failure the claim
-- is released so a later attempt can retry.
--
-- NULL means "not yet sent", which is also the correct state for the 130
-- accounts that pre-date this. They will not be back-filled with a fake
-- timestamp, and equally will not be mass-mailed — nothing sweeps this column
-- looking for work.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS welcome_email_sent_at;
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.welcome_email_sent_at IS
  'When the welcome email was sent. NULL = never sent (includes all accounts created before this shipped).';
