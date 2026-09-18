-- Reportable targets beyond posts and comments: a member, and an AI response.
--
-- WHY
-- community_reports was built polymorphic over exactly two targets and enforced
-- it with
--     CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1)
-- so there was no shape in which a report could name a *person*. The
-- leaderboard shows another member's display name, avatar and progress metrics
-- to every signed-in user; under App Review Guideline 1.2 that surface needs a
-- report affordance, and until now the only thing a member could do about
-- another member on the board was block them (and only by long-pressing a row,
-- which was discoverable solely through accessibilityHint).
--
-- Google Play's generative-AI policy wants the same thing for AI output: an
-- in-app way to flag an offensive or unsafe response. An Aimee message has no
-- database row to point at — chat is client-side — so the report carries the
-- message text and the time it was produced, which is what a reviewer needs to
-- judge it.
--
-- ADDITIVE ONLY. Existing rows stay valid: they already have exactly one of
-- post_id / comment_id, which still satisfies the widened CHECK. No backfill,
-- no data rewritten, no column dropped.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- community_auto_moderate() soft-deletes content once three distinct reporters
-- flag it. Its IF/ELSIF tests post_id then comment_id, so a user report and an
-- AI report fall straight through to RETURN NEW — no automatic action is taken
-- against a member or an assistant reply. Whether N reports should suspend an
-- account is a business rule nobody has stated, so it is not invented here.
--
-- Deploy: supabase db push  (this migration does NOT ship with the app)

-- ─── New target columns ─────────────────────────────────────────────────────

ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS reported_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- The AI reply itself. There is no row to reference, so the report stores the
-- text under review and when it was shown. Capped so a runaway stream cannot
-- write an unbounded row.
ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS ai_message_text TEXT
    CHECK (ai_message_text IS NULL OR length(ai_message_text) <= 4000);

ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS ai_message_at TIMESTAMPTZ;

COMMENT ON COLUMN public.community_reports.reported_user_id IS
  'Member being reported (leaderboard / shout-out row). Mutually exclusive with the other targets.';
COMMENT ON COLUMN public.community_reports.ai_message_text IS
  'Verbatim text of the reported Aimee response. No profile or health context is attached to a report.';
COMMENT ON COLUMN public.community_reports.ai_message_at IS
  'Timestamp of the reported Aimee response, as shown in the chat thread.';

-- ─── Widen the exactly-one-target constraint ────────────────────────────────
-- The original constraint was created inline with the table, so it carries a
-- generated name. Look it up by the relation + its definition rather than
-- guessing at "community_reports_check", which is only its name if nothing else
-- unnamed was added first.

DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT con.conname INTO con_name
    FROM pg_constraint con
   WHERE con.conrelid = 'public.community_reports'::regclass
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%post_id IS NOT NULL%'
     AND pg_get_constraintdef(con.oid) ILIKE '%comment_id IS NOT NULL%'
     AND pg_get_constraintdef(con.oid) NOT ILIKE '%reported_user_id%'
   LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.community_reports DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.community_reports
  DROP CONSTRAINT IF EXISTS community_reports_exactly_one_target;

ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_exactly_one_target CHECK (
    (post_id IS NOT NULL)::int
    + (comment_id IS NOT NULL)::int
    + (reported_user_id IS NOT NULL)::int
    + (ai_message_text IS NOT NULL)::int
    = 1
  );

-- A report about an AI reply is the only kind that carries a message time.
ALTER TABLE public.community_reports
  DROP CONSTRAINT IF EXISTS community_reports_ai_time_with_text;
ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_ai_time_with_text CHECK (
    ai_message_at IS NULL OR ai_message_text IS NOT NULL
  );

-- Reporting yourself is always a mistake or an attack on your own account.
ALTER TABLE public.community_reports
  DROP CONSTRAINT IF EXISTS community_reports_no_self_report;
ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_no_self_report CHECK (
    reported_user_id IS NULL OR reported_user_id <> reporter_id
  );

-- ─── Uniqueness ─────────────────────────────────────────────────────────────
-- UNIQUE (reporter_id, post_id) does not constrain rows where post_id IS NULL —
-- Postgres treats NULLs as distinct — so member reports need their own partial
-- index, or one member could be flagged a thousand times by one reporter and
-- the queue would be useless.

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reports_unique_user_target
  ON public.community_reports (reporter_id, reported_user_id)
  WHERE reported_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_reports_reported_user
  ON public.community_reports (reported_user_id)
  WHERE reported_user_id IS NOT NULL;

-- AI reports are intentionally NOT deduplicated: each one is a distinct
-- response, and there is no id to key on.
CREATE INDEX IF NOT EXISTS idx_community_reports_ai
  ON public.community_reports (created_at DESC)
  WHERE ai_message_text IS NOT NULL;

-- RLS is unchanged: insert requires auth.uid() = reporter_id, select is the
-- reporter's own rows only. The moderation queue reads via the service role.
