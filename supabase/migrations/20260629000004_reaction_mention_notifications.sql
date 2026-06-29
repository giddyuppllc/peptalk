-- ============================================================================
-- Reaction + @mention community notifications (P2 fix)
-- ============================================================================
-- The consumer side already handles 'reaction' and 'mention' kinds end-to-end:
--   - community_notifications CHECK constraint allows both
--       (20260505000000_community_phase2_6.sql)
--   - the tap router in notificationService.ts deep-links them
--   - communityNotificationDelivery.ts renders local banners for them
--   - community-push-fanout has KIND_COPY entries for both
-- ...but NOTHING ever inserted the rows, so reaction/mention notifications
-- were never produced.
--
-- This migration adds the REACTION half: an AFTER INSERT trigger on
-- community_reactions that writes a 'reaction' community_notifications row for
-- the reacted-to content's author. It mirrors community_dispatch_comment_
-- notifications (20260505000000) EXACTLY — same target table + columns
-- (user_id, kind, post_id, comment_id, actor_id), SECURITY DEFINER, and a
-- self-action guard (skip when the reactor IS the author).
--
-- The @MENTION half is inserted by the community-create-comment edge function
-- (it needs the parsed comment body), not a trigger.
--
-- Delivery is automatic: the existing community_notifications_push_fanout
-- AFTER INSERT trigger (20260510000000 / 20260522000000) fans these new rows
-- out to devices — no change needed there.

CREATE OR REPLACE FUNCTION public.community_dispatch_reaction_notifications()
RETURNS TRIGGER AS $$
DECLARE
  target_author UUID;
  target_post   UUID;
BEGIN
  -- The community_reactions CHECK guarantees exactly one of post_id / comment_id
  -- is set. Resolve the author + the owning post either way so the notification
  -- always carries a post_id to deep-link to (mirrors how reply_to_comment sets
  -- both post_id and comment_id).
  IF NEW.post_id IS NOT NULL THEN
    SELECT user_id INTO target_author
      FROM public.community_posts WHERE id = NEW.post_id;
    target_post := NEW.post_id;
  ELSIF NEW.comment_id IS NOT NULL THEN
    SELECT user_id, post_id INTO target_author, target_post
      FROM public.community_comments WHERE id = NEW.comment_id;
  END IF;

  -- Guard self-reaction: don't notify someone for reacting to their own content.
  IF target_author IS NOT NULL AND target_author <> NEW.user_id THEN
    INSERT INTO public.community_notifications (user_id, kind, post_id, comment_id, actor_id)
    VALUES (target_author, 'reaction', target_post, NEW.comment_id, NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS community_reaction_notify ON public.community_reactions;
CREATE TRIGGER community_reaction_notify
  AFTER INSERT ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION public.community_dispatch_reaction_notifications();

-- ─── Rollback ────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS community_reaction_notify ON public.community_reactions;
-- DROP FUNCTION IF EXISTS public.community_dispatch_reaction_notifications();
