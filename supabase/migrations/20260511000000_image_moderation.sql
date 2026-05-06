-- Wave 56: image moderation pipeline
--
-- New columns on community_posts + community_comments to track AI
-- moderation state per row. Plus a trigger that fires the async
-- community-moderate-image edge function whenever a post/comment
-- with images lands.
--
-- Lifecycle:
--   pending  → row inserted/updated with images; awaiting moderation
--   approved → vision pass found nothing flagged
--   flagged  → vision pass flagged something; row soft-deleted +
--              reason logged in community_moderation_log
--
-- We default to 'pending' for any row that has images so the trigger
-- can wake up and run the check. Posts with NO images skip directly
-- to 'approved' so they render normally.

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (moderation_status IN ('pending', 'approved', 'flagged'));

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (moderation_status IN ('pending', 'approved', 'flagged'));

-- Set status to 'pending' on insert/update IF the row carries images.
CREATE OR REPLACE FUNCTION public.community_set_moderation_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.image_urls IS NOT NULL AND array_length(NEW.image_urls, 1) > 0 THEN
    NEW.moderation_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_moderation_pending
  ON public.community_posts;
CREATE TRIGGER community_posts_moderation_pending
  BEFORE INSERT OR UPDATE OF image_urls ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.community_set_moderation_pending();

DROP TRIGGER IF EXISTS community_comments_moderation_pending
  ON public.community_comments;
CREATE TRIGGER community_comments_moderation_pending
  BEFORE INSERT OR UPDATE OF image_urls ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.community_set_moderation_pending();

-- Audit log for transparency: every flagged row leaves a record so
-- mods (and the affected user) can see why.
CREATE TABLE IF NOT EXISTS public.community_moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.community_posts(id) ON DELETE SET NULL,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'flagged', 'error')),
  categories TEXT[] DEFAULT '{}',
  reason TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_moderation_log_post
  ON public.community_moderation_log (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_moderation_log_comment
  ON public.community_moderation_log (comment_id, created_at DESC);

-- AFTER-INSERT trigger: enqueue moderation for posts/comments with images.
-- pg_net fire-and-forget so the user's insert doesn't block on the
-- vision call.
CREATE OR REPLACE FUNCTION public.notify_image_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  target TEXT;
BEGIN
  IF NEW.image_urls IS NULL OR array_length(NEW.image_urls, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.moderation_status <> 'pending' THEN
    RETURN NEW;
  END IF;

  fn_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/community-moderate-image';
  service_key := current_setting('app.settings.service_role_key', true);

  IF fn_url IS NULL OR service_key IS NULL THEN
    -- Settings not configured — auto-approve so the post still renders.
    -- The fail-open default matches our local-poll fallback philosophy:
    -- if the moderation pipeline is misconfigured, we'd rather lose
    -- moderation than lose the post.
    NEW.moderation_status := 'approved';
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'community_posts' THEN
    target := 'post';
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'targetType', 'post',
        'targetId', NEW.id::text,
        'imageUrls', to_jsonb(NEW.image_urls)
      )
    );
  ELSE
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'targetType', 'comment',
        'targetId', NEW.id::text,
        'imageUrls', to_jsonb(NEW.image_urls)
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_image_moderation failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_image_moderation
  ON public.community_posts;
CREATE TRIGGER community_posts_image_moderation
  AFTER INSERT OR UPDATE OF image_urls ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_image_moderation();

DROP TRIGGER IF EXISTS community_comments_image_moderation
  ON public.community_comments;
CREATE TRIGGER community_comments_image_moderation
  AFTER INSERT OR UPDATE OF image_urls ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_image_moderation();
