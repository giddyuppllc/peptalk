-- Wave 65: Live community events + chat
--
-- Admins can host real-time text-chat sessions ("Going live"). When a
-- live event starts, all Plus + Pro tier users get a push notification
-- nudging them to join. Messages stream via Supabase Realtime so the
-- UI updates without polling.
--
-- Schema:
--   community_live_events   one row per scheduled or active session
--   community_live_messages one row per chat message inside an event
--
-- Auth model:
--   - Only ADMIN_EMAILS users can INSERT events (enforced in the
--     community-live-start edge function; RLS is permissive on
--     SELECT for any signed-in user)
--   - Only the host can UPDATE their own event (status changes)
--   - Plus + Pro users can INSERT messages while status='live'
--   - Anyone signed in can SELECT messages (so non-paying users
--     see a teaser preview after the fact)
--
-- The push broadcast on event-start uses the same pg_net + Vault
-- pattern as community-push-fanout / community-moderate-image.

-- ─── community_live_events ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_live_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 140),
  description TEXT CHECK (length(description) <= 600),
  /** Lifecycle:
   *    scheduled → live → ended
   *  We allow scheduled→ended (host cancelled) and live→ended (host
   *  closed). No re-opening once ended; create a new event instead. */
  status TEXT NOT NULL DEFAULT 'live'
    CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  /** Snapshot of tier requirement at creation time. Future-proofing
   *  for free / pro-only events; defaults to plus. */
  required_tier TEXT NOT NULL DEFAULT 'plus'
    CHECK (required_tier IN ('free', 'plus', 'pro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_events_status
  ON public.community_live_events (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_events_host
  ON public.community_live_events (host_user_id, created_at DESC);

ALTER TABLE public.community_live_events ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read; Plus+ gating happens at the message-write
-- level + at the join-banner level (client-side tier check).
CREATE POLICY live_events_read
  ON public.community_live_events FOR SELECT
  TO authenticated
  USING (true);
-- Inserts + updates are service-role only (via edge functions). The
-- start/end edge functions check admin-email match before mutating.

-- ─── community_live_messages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_live_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.community_live_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  /** Host messages render with a host badge in the UI. */
  is_host BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_messages_event
  ON public.community_live_messages (event_id, created_at);

ALTER TABLE public.community_live_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY live_messages_read
  ON public.community_live_messages FOR SELECT
  TO authenticated
  USING (true);
-- Writes go through community-live-send-message which gates on tier +
-- enforces rate limit + checks event is still 'live'.

-- ─── Trigger: broadcast push when an event flips to 'live' ──────────────
-- Reuse the same Vault-secret pattern as the other fanout triggers.
CREATE OR REPLACE FUNCTION public.notify_live_event_broadcast()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  base_url TEXT;
BEGIN
  -- Only fire on transition INTO 'live' state (insert with status=live OR
  -- update from non-live → live). Never re-fire on a re-update.
  IF (TG_OP = 'INSERT' AND NEW.status <> 'live') THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.status = 'live') THEN
    RETURN NEW;
  END IF;
  IF (NEW.status <> 'live') THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
    WHERE name = 'app_supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
    WHERE name = 'app_service_role_key' LIMIT 1;

  IF base_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;  -- Fail-open: event row still inserts, push just doesn't fire.
  END IF;

  fn_url := base_url || '/functions/v1/community-live-broadcast';

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('eventId', NEW.id::text)
  );

  -- Stamp started_at if missing (admin can set it manually too).
  IF NEW.started_at IS NULL THEN
    NEW.started_at := NOW();
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_live_event_broadcast failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_live_event_broadcast
  ON public.community_live_events;
CREATE TRIGGER community_live_event_broadcast
  AFTER INSERT OR UPDATE OF status ON public.community_live_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_live_event_broadcast();

-- Realtime publication so client Supabase subscriptions see new
-- messages without polling. (Supabase auto-enables realtime per-table
-- via ALTER PUBLICATION.)
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_live_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_live_messages;
