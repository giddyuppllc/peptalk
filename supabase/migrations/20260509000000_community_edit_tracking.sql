-- Wave 51: post + comment edit tracking
--
-- Adds last_edited_at to surface "(edited)" tags in the UI so readers
-- can tell when a post/comment was modified after publication. NULL
-- when never edited.
--
-- We don't keep an edit history yet — that's a future moderation /
-- transparency feature. For now we just need the boolean signal.

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;
