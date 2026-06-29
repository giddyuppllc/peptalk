-- ============================================================================
-- Reaction-notify block guard (P2 fix)
-- ============================================================================
-- 20260629000004 added the AFTER INSERT reaction-notify trigger but guarded
-- ONLY against self-reaction. A blocked user could therefore react to content
-- and deliver an Expo push to the author (block-evasion).
--
-- That earlier migration may already be APPLIED in prod, so editing it in place
-- doesn't re-run. This migration CREATE OR REPLACEs the same trigger function
-- (public.community_dispatch_reaction_notifications, fired by trigger
-- community_reaction_notify on public.community_reactions) carrying the
-- symmetric community_blocks guard, so prod actually gets the fix on next push.
-- The trigger itself is unchanged and keeps pointing at this function — no need
-- to drop/recreate it.

CREATE OR REPLACE FUNCTION public.community_dispatch_reaction_notifications()
RETURNS TRIGGER AS $$
DECLARE
  target_author UUID;
  target_post   UUID;
BEGIN
  -- Resolve the author + owning post regardless of post/comment reaction so the
  -- notification always carries a post_id to deep-link to.
  IF NEW.post_id IS NOT NULL THEN
    SELECT user_id INTO target_author
      FROM public.community_posts WHERE id = NEW.post_id;
    target_post := NEW.post_id;
  ELSIF NEW.comment_id IS NOT NULL THEN
    SELECT user_id, post_id INTO target_author, target_post
      FROM public.community_comments WHERE id = NEW.comment_id;
  END IF;

  -- Guard self-reaction AND the symmetric block model: skip the notification
  -- when a community_blocks row exists in EITHER direction between the author
  -- and the reactor.
  IF target_author IS NOT NULL AND target_author <> NEW.user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.community_blocks
       WHERE (blocker_id = target_author AND blocked_id = NEW.user_id)
          OR (blocker_id = NEW.user_id AND blocked_id = target_author)
     ) THEN
    INSERT INTO public.community_notifications (user_id, kind, post_id, comment_id, actor_id)
    VALUES (target_author, 'reaction', target_post, NEW.comment_id, NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
