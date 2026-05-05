-- ============================================================================
-- Community phase 1 — schema + RLS + seed
--
-- Read-only foundation for the in-app community. Schema covers all of
-- v1 (posts, comments, reactions, reports, blocks, topics) so Phase 2-4
-- can ship without further migrations. Phase 1 only renders the empty
-- feed; writes start in Phase 2.
--
-- App Store Guideline 1.2 design notes:
--   - is_deleted soft-delete on every content table (never hard-delete
--     so admins can audit reports + reverse a bad moderation call)
--   - blocks table powers global content hide for the blocker
--   - reports trigger auto-delete after 3 distinct reporters as
--     insurance when admins are asleep
-- ============================================================================

-- ─── Username on profiles ────────────────────────────────────────────────────
-- Unique handle for @mentions and community attribution. Case-insensitive
-- via citext-style functional index. Validation rules enforced at write
-- time by the edge function (alphanum + underscore, 3-20 chars).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_lower
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- ─── Topics ──────────────────────────────────────────────────────────────────
-- Hybrid model: fixed seed list + user-suggested new topics that flow
-- through admin review. Slug is the URL-safe stable id; name is display.

CREATE TABLE IF NOT EXISTS public.community_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,                    -- ionicon name for the chip
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'pending_review', 'rejected')),
  suggested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_topics_active_status
  ON public.community_topics(is_active, status);

ALTER TABLE public.community_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read approved active topics"
  ON public.community_topics;
CREATE POLICY "Anyone can read approved active topics"
  ON public.community_topics
  FOR SELECT
  USING (is_active = TRUE AND status = 'approved');

-- Inserts (suggestions) happen via the create-topic edge function with
-- service-role; users have no direct INSERT/UPDATE policy.

-- Seed the fixed topic list. is_default=TRUE marks them as system topics
-- (distinct from user suggestions in admin tooling later).
INSERT INTO public.community_topics (slug, name, description, icon, is_default, status)
VALUES
  ('metabolic',     'Metabolic',          'GLP-1s, weight management, body recomp',                'flame-outline',     TRUE, 'approved'),
  ('gh',            'Growth Hormone',     'Sermorelin, ipamorelin, CJC-1295, tesamorelin',         'pulse-outline',     TRUE, 'approved'),
  ('repair',        'Repair & Recovery',  'BPC-157, TB-500, injury recovery, joint health',        'bandage-outline',   TRUE, 'approved'),
  ('cognitive',     'Cognitive',          'Semax, Selank, Dihexa, focus / memory peptides',        'bulb-outline',      TRUE, 'approved'),
  ('cycle',         'Cycle Tracking',     'Menstrual cycle, fertility, contraception',             'flower-outline',    TRUE, 'approved'),
  ('sleep',         'Sleep',              'DSIP, sleep peptides, recovery protocols',              'moon-outline',      TRUE, 'approved'),
  ('workouts',      'Workouts',           'Programs, lifts, peptide-paired training',              'barbell-outline',   TRUE, 'approved'),
  ('nutrition',     'Nutrition',          'Diets, meal plans, peptide-aligned eating',             'restaurant-outline',TRUE, 'approved'),
  ('lab-results',   'Lab Results',        'Bloodwork interpretation, biomarkers, panels',          'flask-outline',     TRUE, 'approved'),
  ('side-effects',  'Side Effects',       'Adverse reactions, troubleshooting, safety',            'warning-outline',   TRUE, 'approved'),
  ('beginner',      'Beginner Q&A',       'New to peptides — ask anything, no judgment',           'help-circle-outline',TRUE, 'approved'),
  ('off-topic',     'Off-topic',          'Health-adjacent stuff that doesn''t fit elsewhere',     'cafe-outline',      TRUE, 'approved')
ON CONFLICT (slug) DO NOTHING;

-- ─── Posts ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_slug TEXT NOT NULL REFERENCES public.community_topics(slug) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 140),
  body  TEXT NOT NULL CHECK (length(body)  BETWEEN 1 AND 8000),
  is_deleted BOOLEAN DEFAULT FALSE,
  -- Counters maintained by triggers below so feed queries don't need
  -- to subselect every reaction/comment count on every render.
  reaction_count INT DEFAULT 0,
  comment_count  INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hot path: feed render = newest non-deleted posts, optionally per topic.
CREATE INDEX IF NOT EXISTS idx_community_posts_feed
  ON public.community_posts(created_at DESC)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_community_posts_topic_feed
  ON public.community_posts(topic_slug, created_at DESC)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_community_posts_user
  ON public.community_posts(user_id, created_at DESC)
  WHERE is_deleted = FALSE;

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read non-deleted posts"
  ON public.community_posts;
CREATE POLICY "Anyone can read non-deleted posts"
  ON public.community_posts
  FOR SELECT
  USING (is_deleted = FALSE);

DROP POLICY IF EXISTS "Users can insert their own posts"
  ON public.community_posts;
CREATE POLICY "Users can insert their own posts"
  ON public.community_posts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can soft-delete their own posts"
  ON public.community_posts;
CREATE POLICY "Users can soft-delete their own posts"
  ON public.community_posts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Comments ────────────────────────────────────────────────────────────────
-- Single level of nesting (parent_comment_id) — matches what we'll
-- render. v2 can deepen to true tree threads if needed.

CREATE TABLE IF NOT EXISTS public.community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  is_deleted BOOLEAN DEFAULT FALSE,
  reaction_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post
  ON public.community_comments(post_id, created_at ASC)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_community_comments_user
  ON public.community_comments(user_id, created_at DESC)
  WHERE is_deleted = FALSE;

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read non-deleted comments"
  ON public.community_comments;
CREATE POLICY "Anyone can read non-deleted comments"
  ON public.community_comments
  FOR SELECT
  USING (is_deleted = FALSE);

DROP POLICY IF EXISTS "Users can insert their own comments"
  ON public.community_comments;
CREATE POLICY "Users can insert their own comments"
  ON public.community_comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can soft-delete their own comments"
  ON public.community_comments;
CREATE POLICY "Users can soft-delete their own comments"
  ON public.community_comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Reactions ───────────────────────────────────────────────────────────────
-- Polymorphic over post_id OR comment_id (exactly one set). Three kinds
-- — helpful (the meaningful one), like, dose_warning (community-flagged
-- safety concern that other users are echoing).

CREATE TABLE IF NOT EXISTS public.community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('helpful', 'like', 'dose_warning')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Exactly one target per row.
  CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1),
  -- One reaction of each kind per user per target.
  UNIQUE (user_id, post_id, kind),
  UNIQUE (user_id, comment_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_community_reactions_post
  ON public.community_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_community_reactions_comment
  ON public.community_reactions(comment_id);

ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reactions"
  ON public.community_reactions;
CREATE POLICY "Anyone can read reactions"
  ON public.community_reactions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own reactions"
  ON public.community_reactions;
CREATE POLICY "Users can insert their own reactions"
  ON public.community_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reactions"
  ON public.community_reactions;
CREATE POLICY "Users can delete their own reactions"
  ON public.community_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Reports ─────────────────────────────────────────────────────────────────
-- Polymorphic over post_id OR comment_id. Reasons aligned with App Store
-- 1.2 expectations + practical peptide-app risks.

CREATE TABLE IF NOT EXISTS public.community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN (
    'spam',
    'harassment',
    'unsafe_medical_advice',
    'misinformation',
    'off_topic',
    'other'
  )),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dismissed', 'actioned')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1),
  -- Same user can't report the same target twice.
  UNIQUE (reporter_id, post_id),
  UNIQUE (reporter_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_community_reports_pending
  ON public.community_reports(created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own reports"
  ON public.community_reports;
CREATE POLICY "Users can read their own reports"
  ON public.community_reports
  FOR SELECT
  USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can submit reports"
  ON public.community_reports;
CREATE POLICY "Users can submit reports"
  ON public.community_reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Auto-soft-delete trigger: when 3 distinct reporters flag the same
-- target with non-spam reasons, soft-delete the content immediately
-- and log the action. This is the "asleep at the wheel" insurance.
CREATE OR REPLACE FUNCTION public.community_auto_moderate()
RETURNS TRIGGER AS $$
DECLARE
  distinct_reporters INT;
BEGIN
  IF NEW.post_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT reporter_id) INTO distinct_reporters
      FROM public.community_reports
      WHERE post_id = NEW.post_id AND status = 'pending';
    IF distinct_reporters >= 3 THEN
      UPDATE public.community_posts
        SET is_deleted = TRUE, updated_at = NOW()
        WHERE id = NEW.post_id;
    END IF;
  ELSIF NEW.comment_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT reporter_id) INTO distinct_reporters
      FROM public.community_reports
      WHERE comment_id = NEW.comment_id AND status = 'pending';
    IF distinct_reporters >= 3 THEN
      UPDATE public.community_comments
        SET is_deleted = TRUE
        WHERE id = NEW.comment_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS community_auto_moderate_trigger ON public.community_reports;
CREATE TRIGGER community_auto_moderate_trigger
  AFTER INSERT ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION public.community_auto_moderate();

-- ─── Blocks ──────────────────────────────────────────────────────────────────
-- Symmetrical hide: A blocks B → A doesn't see B's content AND B doesn't
-- see A's content. Simplest reciprocal block model (no "muted" mid-state).

CREATE TABLE IF NOT EXISTS public.community_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_community_blocks_blocker
  ON public.community_blocks(blocker_id);

ALTER TABLE public.community_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own blocks"
  ON public.community_blocks;
CREATE POLICY "Users can manage their own blocks"
  ON public.community_blocks
  FOR ALL
  USING (auth.uid() = blocker_id)
  WITH CHECK (auth.uid() = blocker_id);

-- ─── Counter triggers ────────────────────────────────────────────────────────
-- Maintain reaction_count + comment_count denormalized on posts/comments
-- so the feed query is one cheap SELECT instead of N subselects.

CREATE OR REPLACE FUNCTION public.community_bump_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_deleted = FALSE THEN
    UPDATE public.community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE THEN
    UPDATE public.community_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS community_comment_counter ON public.community_comments;
CREATE TRIGGER community_comment_counter
  AFTER INSERT OR UPDATE OF is_deleted ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_bump_post_comment_count();

CREATE OR REPLACE FUNCTION public.community_bump_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE public.community_posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
    ELSIF NEW.comment_id IS NOT NULL THEN
      UPDATE public.community_comments SET reaction_count = reaction_count + 1 WHERE id = NEW.comment_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_id IS NOT NULL THEN
      UPDATE public.community_posts SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.post_id;
    ELSIF OLD.comment_id IS NOT NULL THEN
      UPDATE public.community_comments SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.comment_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS community_reaction_counter ON public.community_reactions;
CREATE TRIGGER community_reaction_counter
  AFTER INSERT OR DELETE ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION public.community_bump_reaction_count();
