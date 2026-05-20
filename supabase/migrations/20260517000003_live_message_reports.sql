-- Wave 68: User-facing report path for community_live_messages.
--
-- Apple Guideline 1.2 requires every UGC surface to expose a "report"
-- affordance to viewers, not just self-delete to the author. Live chat
-- messages had edit/delete (owner / host) but no way for non-owners to
-- flag abuse. This migration backs that report flow with its own table
-- so live-message moderation has a clean lifecycle separate from the
-- existing community_reports table (which is keyed by post/comment).

CREATE TABLE IF NOT EXISTS public.community_live_message_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.community_live_messages(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Free-form short reason from a fixed client-side enum. We don't
   *  CHECK the values here so future client expansion doesn't require a
   *  migration; the admin queue groups by exact string. */
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dismissed', 'actioned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_live_msg_reports_pending
  ON public.community_live_message_reports (created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_live_msg_reports_message
  ON public.community_live_message_reports (message_id);

-- A user shouldn't be able to spam-report the same message; one report
-- per (message, reporter) keeps the queue meaningful.
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_msg_reports_unique_per_user
  ON public.community_live_message_reports (message_id, reporter_user_id);

ALTER TABLE public.community_live_message_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_msg_reports_insert_self
  ON public.community_live_message_reports;
CREATE POLICY live_msg_reports_insert_self
  ON public.community_live_message_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_user_id);

DROP POLICY IF EXISTS live_msg_reports_select_self
  ON public.community_live_message_reports;
CREATE POLICY live_msg_reports_select_self
  ON public.community_live_message_reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_user_id);

-- Admin SELECT/UPDATE for the moderation queue happens via the service
-- role from the community-moderate edge function (RLS bypassed). No
-- additional client-side admin policy needed.
