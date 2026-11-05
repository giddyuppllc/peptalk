-- Web (PWA) dose reminders — 2026-11-05.
--
-- Native reminders are scheduled on the phone. A browser has no scheduler, so
-- on web the app writes the schedule here and the `web-dose-reminders` edge
-- function (run every 5 minutes by pg_cron) sends Web Push when a dose is due.
-- See src/services/webPush.ts and supabase/functions/web-dose-reminders.
--
-- NOT APPLIED. Order at go-live: set the VAPID secrets, deploy the function,
-- then apply this migration (the cron job calls the function).
--
-- Reversible:
--   SELECT cron.unschedule('web-dose-reminders');
--   DROP TABLE IF EXISTS public.web_push_sent, public.web_dose_reminders, public.web_push_subscriptions;

-- ── Where to deliver: one row per browser/device ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  time_zone     text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_sent_at  timestamptz,
  failure_count integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_idx ON public.web_push_subscriptions (user_id);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_push_subscriptions_own_select ON public.web_push_subscriptions;
DROP POLICY IF EXISTS web_push_subscriptions_own_insert ON public.web_push_subscriptions;
DROP POLICY IF EXISTS web_push_subscriptions_own_update ON public.web_push_subscriptions;
DROP POLICY IF EXISTS web_push_subscriptions_own_delete ON public.web_push_subscriptions;
CREATE POLICY web_push_subscriptions_own_select ON public.web_push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY web_push_subscriptions_own_insert ON public.web_push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY web_push_subscriptions_own_update ON public.web_push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY web_push_subscriptions_own_delete ON public.web_push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- ── What to remind and when: one row per user per peptide ───────────────────
-- Mirrors one native scheduleDoseReminder() call: same peptide, time, protocol
-- frequency and start (anchor) date. Deleted when the protocol is deactivated
-- or the dose toggle is turned off; `enabled` follows the master switch.
CREATE TABLE IF NOT EXISTS public.web_dose_reminders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peptide_id    text NOT NULL,
  peptide_name  text NOT NULL,
  reminder_time text NOT NULL CHECK (reminder_time ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'),
  frequency     text NOT NULL,
  anchor_date   date,
  time_zone     text NOT NULL DEFAULT 'UTC',
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, peptide_id)
);
CREATE INDEX IF NOT EXISTS web_dose_reminders_enabled_idx ON public.web_dose_reminders (enabled) WHERE enabled;

ALTER TABLE public.web_dose_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_dose_reminders_own_select ON public.web_dose_reminders;
DROP POLICY IF EXISTS web_dose_reminders_own_insert ON public.web_dose_reminders;
DROP POLICY IF EXISTS web_dose_reminders_own_update ON public.web_dose_reminders;
DROP POLICY IF EXISTS web_dose_reminders_own_delete ON public.web_dose_reminders;
CREATE POLICY web_dose_reminders_own_select ON public.web_dose_reminders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY web_dose_reminders_own_insert ON public.web_dose_reminders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY web_dose_reminders_own_update ON public.web_dose_reminders
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY web_dose_reminders_own_delete ON public.web_dose_reminders
  FOR DELETE USING (auth.uid() = user_id);

-- ── Each dose reminds once ───────────────────────────────────────────────────
-- The function claims (reminder, due instant) here BEFORE sending; a second
-- run, an overlapping run, or a retry finds the row and sends nothing.
-- Service role only: no policies, RLS on.
CREATE TABLE IF NOT EXISTS public.web_push_sent (
  reminder_id uuid NOT NULL REFERENCES public.web_dose_reminders(id) ON DELETE CASCADE,
  due_at      timestamptz NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  delivered   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (reminder_id, due_at)
);
ALTER TABLE public.web_push_sent ENABLE ROW LEVEL SECURITY;

-- ── Schedule: every 5 minutes ────────────────────────────────────────────────
-- Neither extension was installed on 2026-11-05. pg_net is ALSO what the
-- existing community push / moderation triggers call (net.http_post); without
-- it those triggers have been failing into their EXCEPTION handlers.
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Same vault entries the existing pg_net triggers read
-- (20260522000000_pg_net_internal_secret.sql).
CREATE OR REPLACE FUNCTION public.invoke_web_dose_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url TEXT;
  service_key TEXT;
  internal_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'app_supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'app_service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO internal_secret FROM vault.decrypted_secrets WHERE name = 'app_internal_function_secret' LIMIT 1;
  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'invoke_web_dose_reminders: vault entries missing';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := base_url || '/functions/v1/web-dose-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'x-internal-key', COALESCE(internal_secret, '')
    ),
    body := '{}'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION public.invoke_web_dose_reminders() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('web-dose-reminders')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'web-dose-reminders');
  PERFORM cron.schedule('web-dose-reminders', '*/5 * * * *', 'SELECT public.invoke_web_dose_reminders();');
END $$;
