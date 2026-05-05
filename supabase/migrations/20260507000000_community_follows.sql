-- ============================================================================
-- Community follow graph — one-directional, idempotent, RLS-locked.
-- Powers the "Following" feed mode + future trending-among-following
-- ranking. Symmetric in spirit (you can both follow each other) but
-- modeled as one row per direction.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.community_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);

CREATE INDEX IF NOT EXISTS idx_community_follows_follower
  ON public.community_follows(follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_follows_followed
  ON public.community_follows(followed_id, created_at DESC);

ALTER TABLE public.community_follows ENABLE ROW LEVEL SECURITY;

-- Anyone can see who's following whom (public follow graph, like Twitter).
DROP POLICY IF EXISTS "Anyone can read follows" ON public.community_follows;
CREATE POLICY "Anyone can read follows"
  ON public.community_follows
  FOR SELECT USING (true);

-- Only the follower themselves can follow / unfollow.
DROP POLICY IF EXISTS "Users manage their own follows" ON public.community_follows;
CREATE POLICY "Users manage their own follows"
  ON public.community_follows
  FOR ALL
  USING (auth.uid() = follower_id)
  WITH CHECK (auth.uid() = follower_id);
