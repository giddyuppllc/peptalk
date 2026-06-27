-- ============================================================================
-- Hide pending-image content until moderation approves it (App Store 1.2 / UGC)
--
-- The image-moderation pipeline (Wave 56, 20260511000000_image_moderation.sql)
-- runs ASYNC after insert. Until this migration, the posts/comments SELECT
-- policies only filtered `is_deleted`, so a post's image was PUBLICLY visible
-- the instant it was inserted — before vision moderation had a chance to run.
-- That defeats pre-publication review and contradicts the in-app
-- "visible to others once approved" badge.
--
-- This migration tightens the SELECT policies so that a row carrying an image
-- whose moderation_status is still 'pending' is visible ONLY to its author
-- (auth.uid() = user_id). Text-only rows (no image_urls) keep
-- moderation_status='approved' by default and are unaffected. Flagged rows are
-- already soft-deleted (is_deleted = TRUE) by the edge function, so the
-- existing is_deleted filter continues to hide them.
--
-- Columns referenced (from earlier migrations):
--   community_posts/community_comments.is_deleted        (20260503000000)
--   community_posts/community_comments.image_urls        (added with images)
--   community_posts/community_comments.moderation_status (20260511000000)
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- To revert to the previous (fail-open) behaviour, restore the original
-- SELECT policies:
--   DROP POLICY IF EXISTS "Anyone can read non-deleted posts" ON public.community_posts;
--   CREATE POLICY "Anyone can read non-deleted posts" ON public.community_posts
--     FOR SELECT USING (is_deleted = FALSE);
--   DROP POLICY IF EXISTS "Anyone can read non-deleted comments" ON public.community_comments;
--   CREATE POLICY "Anyone can read non-deleted comments" ON public.community_comments
--     FOR SELECT USING (is_deleted = FALSE);
-- ============================================================================

-- ─── Posts ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read non-deleted posts"
  ON public.community_posts;
CREATE POLICY "Anyone can read non-deleted posts"
  ON public.community_posts
  FOR SELECT
  USING (
    is_deleted = FALSE
    AND (
      -- Visible to everyone once there's no pending image to review.
      moderation_status <> 'pending'
      OR image_urls IS NULL
      OR array_length(image_urls, 1) IS NULL
      -- Pending image → author-only until moderation approves it.
      OR auth.uid() = user_id
    )
  );

-- ─── Comments ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read non-deleted comments"
  ON public.community_comments;
CREATE POLICY "Anyone can read non-deleted comments"
  ON public.community_comments
  FOR SELECT
  USING (
    is_deleted = FALSE
    AND (
      moderation_status <> 'pending'
      OR image_urls IS NULL
      OR array_length(image_urls, 1) IS NULL
      OR auth.uid() = user_id
    )
  );
