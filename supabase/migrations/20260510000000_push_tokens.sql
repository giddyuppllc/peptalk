-- Wave 55: real push notifications
--
-- Adds the user → device → Expo push token mapping that the
-- community-push-fanout edge function reads to deliver pushes to the
-- right devices. Up to 4 active devices per user (cap matches the
-- typical "iPhone + iPad + maybe a partner's device" pattern).
--
-- Tokens rotate on app reinstall and OS notification permission flips,
-- so we update on conflict (user_id, expo_push_token) — the same token
-- on the same user just bumps last_seen.
--
-- Stale token cleanup happens server-side in the edge function: when
-- Expo's push API returns a "DeviceNotRegistered" receipt for a token
-- we DELETE that row.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_id TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON public.push_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_active
  ON public.push_tokens (user_id, last_seen_at DESC);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read + write only their own tokens. Service role (used by
-- edge functions) bypasses RLS as usual.
CREATE POLICY push_tokens_self_read
  ON public.push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY push_tokens_self_insert
  ON public.push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_tokens_self_update
  ON public.push_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_tokens_self_delete
  ON public.push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Trigger: enqueue community_notifications for push fanout ─────────────
--
-- When a row lands in community_notifications we need to push it to the
-- recipient's devices. We call the community-push-fanout edge function
-- via pg_net's http_post — fire-and-forget; if it fails we log it but
-- don't block the original transaction.
--
-- The function URL is read from a Postgres setting we set per-environment:
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://…';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '…';
--
-- pg_net is enabled in the Supabase managed environment by default.

CREATE OR REPLACE FUNCTION public.notify_push_fanout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
BEGIN
  -- Skip if the recipient asked not to be pushed (mute flag, future).
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  fn_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/community-push-fanout';
  service_key := current_setting('app.settings.service_role_key', true);

  IF fn_url IS NULL OR service_key IS NULL THEN
    -- Settings not configured yet — function URL/key not wired. Skip
    -- silently so the insert still succeeds. Local-poll delivery still
    -- works in this case.
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('notificationId', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- pg_net errors / network blips shouldn't block the insert.
  RAISE WARNING 'notify_push_fanout failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_notifications_push_fanout
  ON public.community_notifications;

CREATE TRIGGER community_notifications_push_fanout
  AFTER INSERT ON public.community_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_fanout();
