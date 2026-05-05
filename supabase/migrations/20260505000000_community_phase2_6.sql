-- ============================================================================
-- Community Phase 2-6 — anonymous handles, notifications, deletion fanout
-- ============================================================================

-- ─── Anonymous toggle ────────────────────────────────────────────────────────
-- Per-post / per-comment anonymous-display flag. Author identity is still
-- recorded (user_id) for moderation; UI just renders "Anonymous Pep User".

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE;

-- ─── Notifications ───────────────────────────────────────────────────────────
-- In-app notifications log. Push delivery is best-effort; this table is
-- the canonical record so users see unread counts on next open even if
-- the push failed.

CREATE TABLE IF NOT EXISTS public.community_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'reply_to_post',
    'reply_to_comment',
    'reaction',
    'mention',
    'moderation_action'
  )),
  -- Polymorphic source pointer.
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_notifications_user_unread
  ON public.community_notifications(user_id, created_at DESC)
  WHERE is_read = FALSE;

ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own notifications"
  ON public.community_notifications;
CREATE POLICY "Users read their own notifications"
  ON public.community_notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update their own notifications"
  ON public.community_notifications;
CREATE POLICY "Users update their own notifications"
  ON public.community_notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Inserts only via service-role from the create-comment edge function.

-- ─── Notification dispatcher ─────────────────────────────────────────────────
-- When a comment is inserted, write a notification to:
--   - The post author (if not the same user)
--   - The parent-comment author (if reply_to_comment + not the same user)
-- Idempotent enough — same actor commenting twice on the same post fires
-- two notifications, which is the desired UX.

CREATE OR REPLACE FUNCTION public.community_dispatch_comment_notifications()
RETURNS TRIGGER AS $$
DECLARE
  post_author UUID;
  parent_author UUID;
BEGIN
  IF NEW.is_deleted THEN RETURN NEW; END IF;

  SELECT user_id INTO post_author FROM public.community_posts WHERE id = NEW.post_id;
  IF post_author IS NOT NULL AND post_author <> NEW.user_id THEN
    INSERT INTO public.community_notifications (user_id, kind, post_id, comment_id, actor_id)
    VALUES (post_author, 'reply_to_post', NEW.post_id, NEW.id, NEW.user_id);
  END IF;

  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT user_id INTO parent_author FROM public.community_comments WHERE id = NEW.parent_comment_id;
    IF parent_author IS NOT NULL
       AND parent_author <> NEW.user_id
       AND parent_author <> COALESCE(post_author, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.community_notifications (user_id, kind, post_id, comment_id, actor_id)
      VALUES (parent_author, 'reply_to_comment', NEW.post_id, NEW.id, NEW.user_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS community_comment_notify ON public.community_comments;
CREATE TRIGGER community_comment_notify
  AFTER INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_dispatch_comment_notifications();
