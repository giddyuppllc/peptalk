-- One-time web alerts: the vial-expiry and cycle-end notices activation
-- promises (src/services/protocolAlerts.ts). Native schedules them locally;
-- the web app has no local scheduler, so they are rows the existing
-- web-dose-reminders function (every 5 minutes) sends by Web Push.
--
-- Additive. Requires 20261105020000_web_push_dose_reminders (subscriptions).
-- Reversible: DROP TABLE IF EXISTS public.web_one_shot_alerts;

CREATE TABLE IF NOT EXISTS public.web_one_shot_alerts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  fire_at    timestamptz NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag)
);

CREATE INDEX IF NOT EXISTS web_one_shot_alerts_due_idx
  ON public.web_one_shot_alerts (fire_at) WHERE sent_at IS NULL AND enabled;

ALTER TABLE public.web_one_shot_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS web_one_shot_alerts_own_select ON public.web_one_shot_alerts;
DROP POLICY IF EXISTS web_one_shot_alerts_own_insert ON public.web_one_shot_alerts;
DROP POLICY IF EXISTS web_one_shot_alerts_own_update ON public.web_one_shot_alerts;
DROP POLICY IF EXISTS web_one_shot_alerts_own_delete ON public.web_one_shot_alerts;
CREATE POLICY web_one_shot_alerts_own_select ON public.web_one_shot_alerts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY web_one_shot_alerts_own_insert ON public.web_one_shot_alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY web_one_shot_alerts_own_update ON public.web_one_shot_alerts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY web_one_shot_alerts_own_delete ON public.web_one_shot_alerts
  FOR DELETE USING (auth.uid() = user_id);
