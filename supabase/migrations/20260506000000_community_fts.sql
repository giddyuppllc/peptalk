-- ============================================================================
-- Community full-text search — tsvector column + GIN index + auto-maintain
-- trigger.
--
-- Replaces the ILIKE-based search in supabase/functions/community-search
-- with proper Postgres FTS so:
--   - "tirzepatide nausea" matches both words anywhere in title/body
--   - Stemming: "running" matches "run", "stacks" matches "stack"
--   - Ranking via ts_rank so the most-relevant posts surface first
--
-- The fts column is materialized via a trigger on insert/update so reads
-- are a single-index lookup, not a per-row to_tsvector(...) recompute.
-- ============================================================================

-- 1. Column.
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS fts tsvector;

-- 2. Trigger to populate it on insert/update.
CREATE OR REPLACE FUNCTION public.community_posts_fts_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fts :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body,  '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS community_posts_fts_trigger ON public.community_posts;
CREATE TRIGGER community_posts_fts_trigger
  BEFORE INSERT OR UPDATE OF title, body ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.community_posts_fts_update();

-- 3. Backfill existing rows so search works on day 1.
UPDATE public.community_posts
  SET fts =
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body,  '')), 'B')
  WHERE fts IS NULL;

-- 4. GIN index for fast lookup.
CREATE INDEX IF NOT EXISTS idx_community_posts_fts
  ON public.community_posts USING GIN (fts);
