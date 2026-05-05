-- Wave 47: image attachments on community posts
--
-- Adds image_urls TEXT[] to community_posts so users can attach R2-hosted
-- images to their posts. URLs are produced by the community-upload-image
-- edge function (signed PUT → R2 → public CDN URL); we only persist the
-- final public URL here.
--
-- Why TEXT[] instead of a join table:
--   - Average post will have 0-3 images. Inline array is faster to read,
--     no extra query, no orphan rows when posts are deleted (cascades
--     are implicit since the array column lives on the post row).
--   - Moderation tooling can still query for posts with images via
--     `WHERE array_length(image_urls, 1) > 0`.
--
-- Cap chosen at 4: matches the typical social-media UX limit and keeps
-- the post detail page from turning into an infinite scroll. Enforced
-- as a CHECK constraint so the edge function can't silently allow more.

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_image_urls_max_4
  CHECK (array_length(image_urls, 1) IS NULL OR array_length(image_urls, 1) <= 4);

-- Comments can also carry images (replies often want to share a screenshot
-- of bloodwork, dose math, etc.).
ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

ALTER TABLE public.community_comments
  ADD CONSTRAINT community_comments_image_urls_max_4
  CHECK (array_length(image_urls, 1) IS NULL OR array_length(image_urls, 1) <= 4);
