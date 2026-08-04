-- Security fix (audit M2): the "soft-delete your own post/comment" RLS UPDATE
-- policy (USING auth.uid() = user_id, WITH CHECK auth.uid() = user_id) is
-- COLUMN-unrestricted, so via raw PostgREST an owner can update ANY column of
-- their own row:
--   • moderation_status → self-approve a pending-image post before AI vision
--     moderation runs (defeats hide_pending_images + App-Store pre-publication),
--   • is_deleted true→false → un-delete a post community_auto_moderate removed,
--   • reaction_count / comment_count → vanity inflation.
--
-- The app NEVER updates these tables directly from the client (verified: all
-- edits/deletes go through service-role edge functions), so this only closes the
-- raw-PostgREST attack path. Conservative fix: a BEFORE UPDATE trigger that, for
-- NON-privileged roles (authenticated/anon), pins the security-relevant columns
-- to their OLD values and forbids un-delete. service_role / postgres are exempt,
-- so legitimate moderation, edits, and counter updates are unaffected.

CREATE OR REPLACE FUNCTION public.guard_community_post_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    NEW.moderation_status := OLD.moderation_status;
    NEW.reaction_count    := OLD.reaction_count;
    NEW.comment_count     := OLD.comment_count;
    NEW.user_id           := OLD.user_id;
    NEW.created_at        := OLD.created_at;
    -- allow soft-delete (false→true); forbid un-delete (true→false)
    IF OLD.is_deleted AND NOT NEW.is_deleted THEN
      NEW.is_deleted := OLD.is_deleted;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_community_post_update ON public.community_posts;
CREATE TRIGGER guard_community_post_update
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_post_update();

CREATE OR REPLACE FUNCTION public.guard_community_comment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    NEW.moderation_status := OLD.moderation_status;
    NEW.reaction_count    := OLD.reaction_count;   -- community_comments has no comment_count
    NEW.user_id           := OLD.user_id;
    NEW.created_at        := OLD.created_at;
    IF OLD.is_deleted AND NOT NEW.is_deleted THEN
      NEW.is_deleted := OLD.is_deleted;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_community_comment_update ON public.community_comments;
CREATE TRIGGER guard_community_comment_update
  BEFORE UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_comment_update();
