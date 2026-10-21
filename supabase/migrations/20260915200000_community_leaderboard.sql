-- ============================================================================
-- Community leaderboard — opt-in, derived from data the app already records.
--
-- NOT APPLIED. Written 2026-09-15 on feat/leaderboard-2026-09-15; ships only
-- when Edward deploys PepTalk. Tested in a throwaway Postgres by
-- `npm run test:leaderboard-sql` (Docker).
--
-- WHAT THIS ADDS
--   profiles.leaderboard_opt_in    the user's choice. DEFAULT false — nobody is
--                                  on the board until they say so.
--   get_community_leaderboard()    ranked opted-in users on one metric
--   get_community_shoutouts()      recent real milestones of opted-in users
--   get_my_leaderboard_metrics()   the caller's own three numbers
--   _leaderboard_metrics_for()     internal: the metric rules      (not callable)
--   _leaderboard_milestones_for()  internal: the milestone rules   (not callable)
--   _leaderboard_doses_per_week()  internal: frequency → doses/week (not callable)
--
-- METRICS — each derives from a table the client already syncs:
--   checkin_streak       check_ins.date
--   dose_adherence_30d   active_protocols (frequency, dates) + dose_logs counts
--   workouts_30d         workout_logs.completed_at
-- The same rules are written as pure functions in src/lib/leaderboardMetrics.ts;
-- the Docker test seeds one fixture and fails on any number that differs.
-- "Goals completed" is not here: goals persist on the device only.
--
-- WHAT LEAVES THE DATABASE, AND WHAT NEVER DOES
--   Out:   user_id, username, display_name, avatar_url (all already public to
--          signed-in users via public_profiles), rank, one metric value, is_self,
--          and for shout-outs the milestone kind, threshold and date.
--   Never: email, names, age, any check-in value (weight, HR, mood…), dose
--          amounts, compound ids or names, notes, protocol details.
--
-- SECURITY — read before editing
--   * The base tables are self-only under RLS, so ranking OTHER users requires
--     SECURITY DEFINER, which bypasses RLS entirely. The functions therefore
--     enforce the rules themselves: auth.uid() must be present, and a user is
--     included only when profiles.leaderboard_opt_in IS TRUE. A later edit that
--     drops that predicate exposes every account's metrics.
--   * `REVOKE ... FROM PUBLIC` alone locks NOTHING on Supabase: default
--     privileges grant EXECUTE on new public functions to `anon` and
--     `authenticated` by name. Every function below revokes the named roles.
--     Verify on the live project after applying: `npm run verify:rpcgrants`.
--   * search_path = '' and every object schema-qualified, so a definer function
--     cannot be pointed at a look-alike table.
--   * Nothing is cached. Opting out removes a user from every subsequent call
--     immediately; there is no materialized table to go stale.
--   * community_blocks is honoured in both directions, matching the feed.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.get_community_leaderboard(text, integer);
--   DROP FUNCTION IF EXISTS public.get_community_shoutouts(integer);
--   DROP FUNCTION IF EXISTS public.get_my_leaderboard_metrics();
--   DROP FUNCTION IF EXISTS public._leaderboard_milestones_for(uuid[], date);
--   DROP FUNCTION IF EXISTS public._leaderboard_metrics_for(uuid[], date);
--   DROP FUNCTION IF EXISTS public._leaderboard_doses_per_week(text);
--   DROP INDEX IF EXISTS public.idx_profiles_leaderboard_opt_in;
--   DROP INDEX IF EXISTS public.idx_workout_logs_user_completed;
--   DROP INDEX IF EXISTS public.idx_active_protocols_user_active;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS leaderboard_opt_in;
-- ============================================================================

-- ── 1. The choice ──────────────────────────────────────────────────────────
-- NOT NULL DEFAULT false: existing accounts read as opted out without a
-- backfill, and the gate never has to decide what NULL means.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS leaderboard_opt_in BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.leaderboard_opt_in IS
  'User chose to appear on the community leaderboard (onboarding or Profile → Public sharing). Default false. Read by get_community_leaderboard / get_community_shoutouts, which include ONLY rows where this IS TRUE.';

-- The owner-only UPDATE policy on profiles already lets a user change their own
-- flag and nobody else's; profiles_protect_tier_columns does not touch it.

CREATE INDEX IF NOT EXISTS idx_profiles_leaderboard_opt_in
  ON public.profiles (id) WHERE leaderboard_opt_in;

CREATE INDEX IF NOT EXISTS idx_workout_logs_user_completed
  ON public.workout_logs (user_id, completed_at) WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_active_protocols_user_active
  ON public.active_protocols (user_id) WHERE is_active;

-- ── 2. Internal: frequency → doses per week ─────────────────────────────────
-- Mirrors dosesPerWeekFor() in src/utils/doseAdherence.ts. jest parses this
-- CASE and fails if any value drifts from the app's.
CREATE OR REPLACE FUNCTION public._leaderboard_doses_per_week(p_frequency text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_frequency
    WHEN 'twice_daily' THEN 14
    WHEN 'daily'       THEN 7
    WHEN 'eod'         THEN 3.5
    WHEN 'tiw'         THEN 3
    WHEN 'biw'         THEN 2
    WHEN 'weekly'      THEN 1
    WHEN 'biweekly'    THEN 0.5
    WHEN 'monthly'     THEN 0.25
    ELSE 7
  END::numeric;
$$;

-- ── 3. Internal: the metric rules ───────────────────────────────────────────
-- Takes the users to compute for; does NOT gate on opt-in. Every public caller
-- decides who is in that array. Not executable by anon or authenticated.
CREATE OR REPLACE FUNCTION public._leaderboard_metrics_for(p_users uuid[], p_today date)
RETURNS TABLE (
  user_id            uuid,
  checkin_streak     integer,
  dose_adherence_30d integer,
  workouts_30d       integer
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH
  -- check-in streak: gaps-and-islands over distinct dates; the latest run
  -- counts only if it ended yesterday or later (STREAK_GRACE_DAYS = 1).
  checkin_days AS (
    SELECT DISTINCT c.user_id, c.date AS d
      FROM public.check_ins c
     WHERE c.user_id = ANY (p_users)
       AND c.date <= p_today + 1
  ),
  islands AS (
    SELECT cd.user_id, cd.d,
           cd.d - (row_number() OVER (PARTITION BY cd.user_id ORDER BY cd.d))::integer AS grp
      FROM checkin_days cd
  ),
  runs AS (
    SELECT i.user_id, max(i.d) AS run_end, count(*)::integer AS len
      FROM islands i
     GROUP BY i.user_id, i.grp
  ),
  streak AS (
    SELECT DISTINCT ON (r.user_id)
           r.user_id,
           CASE WHEN r.run_end >= p_today - 1 THEN r.len ELSE 0 END AS checkin_streak
      FROM runs r
     ORDER BY r.user_id, r.run_end DESC
  ),
  -- dose adherence: per active protocol, logged (not planned) doses in the
  -- 30-day window, capped at the expected count, over total expected.
  protos AS (
    SELECT ap.user_id,
           ap.peptide_id,
           greatest(coalesce(ap.start_date, p_today - 29), p_today - 29) AS ws,
           least(coalesce(ap.end_date, p_today), p_today)                AS we,
           public._leaderboard_doses_per_week(ap.frequency)              AS dpw
      FROM public.active_protocols ap
     WHERE ap.user_id = ANY (p_users)
       AND ap.is_active IS TRUE
  ),
  proto_scores AS (
    SELECT pr.user_id,
           greatest(1, round((pr.dpw * ((pr.we - pr.ws) + 1)) / 7))::integer AS expected,
           (SELECT count(*)
              FROM public.dose_logs dl
             WHERE dl.user_id = pr.user_id
               AND dl.peptide_id = pr.peptide_id
               AND dl.date BETWEEN pr.ws AND pr.we
               AND coalesce(dl.source, 'user') <> 'planned')::integer        AS logged
      FROM protos pr
     WHERE pr.we >= pr.ws
  ),
  adherence AS (
    SELECT ps.user_id,
           round(100.0 * sum(least(ps.logged, ps.expected)) / sum(ps.expected))::integer AS pct
      FROM proto_scores ps
     GROUP BY ps.user_id
  ),
  workouts AS (
    SELECT w.user_id, count(*)::integer AS n
      FROM public.workout_logs w
     WHERE w.user_id = ANY (p_users)
       AND w.completed_at IS NOT NULL
       AND (w.completed_at AT TIME ZONE 'UTC')::date BETWEEN p_today - 29 AND p_today
     GROUP BY w.user_id
  )
  SELECT u.id,
         coalesce(s.checkin_streak, 0),
         a.pct,
         coalesce(w.n, 0)
    FROM unnest(p_users) AS u(id)
    LEFT JOIN streak    s ON s.user_id = u.id
    LEFT JOIN adherence a ON a.user_id = u.id
    LEFT JOIN workouts  w ON w.user_id = u.id;
$$;

-- ── 4. Internal: the milestone rules ────────────────────────────────────────
-- Thresholds are the app's existing badge thresholds (useAchievementStore
-- BADGES). jest parses these arrays against BADGES. Window: 14 days back,
-- one day of timezone grace forward.
CREATE OR REPLACE FUNCTION public._leaderboard_milestones_for(p_users uuid[], p_today date)
RETURNS TABLE (
  user_id     uuid,
  kind        text,
  threshold   integer,
  achieved_on date
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH
  checkin_days AS (
    SELECT DISTINCT c.user_id, c.date AS d
      FROM public.check_ins c
     WHERE c.user_id = ANY (p_users)
       AND c.date <= p_today + 1
  ),
  islands AS (
    SELECT cd.user_id, cd.d,
           cd.d - (row_number() OVER (PARTITION BY cd.user_id ORDER BY cd.d))::integer AS grp
      FROM checkin_days cd
  ),
  runs AS (
    SELECT i.user_id, min(i.d) AS run_start, count(*)::integer AS len
      FROM islands i
     GROUP BY i.user_id, i.grp
  ),
  streak_events AS (
    SELECT r.user_id, 'checkin_streak'::text AS kind, t.threshold,
           (r.run_start + (t.threshold - 1)) AS achieved_on
      FROM runs r
      JOIN unnest(ARRAY[3, 7, 14, 30]) AS t(threshold) ON r.len >= t.threshold
  ),
  workout_seq AS (
    SELECT w.user_id,
           (w.completed_at AT TIME ZONE 'UTC')::date AS d,
           row_number() OVER (PARTITION BY w.user_id ORDER BY w.completed_at, w.id) AS n
      FROM public.workout_logs w
     WHERE w.user_id = ANY (p_users)
       AND w.completed_at IS NOT NULL
  ),
  workout_events AS (
    SELECT ws.user_id, 'workout_count'::text AS kind, ws.n::integer AS threshold, ws.d AS achieved_on
      FROM workout_seq ws
     WHERE ws.n = ANY (ARRAY[1, 10])
  )
  SELECT e.user_id, e.kind, e.threshold, e.achieved_on
    FROM (SELECT * FROM streak_events UNION ALL SELECT * FROM workout_events) e
   WHERE e.achieved_on BETWEEN p_today - 13 AND p_today + 1;
$$;

-- ── 5. Public: the leaderboard ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_community_leaderboard(p_metric text, p_limit integer DEFAULT 50)
RETURNS TABLE (
  rank         integer,
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  metric_value integer,
  is_self      boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_users uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF p_metric IS NULL OR p_metric NOT IN ('checkin_streak', 'dose_adherence_30d', 'workouts_30d') THEN
    RAISE EXCEPTION 'unknown leaderboard metric' USING ERRCODE = '22023';
  END IF;

  -- THE GATE. Opted in, and no block in either direction with the viewer.
  SELECT array_agg(p.id) INTO v_users
    FROM public.profiles p
   WHERE p.leaderboard_opt_in IS TRUE
     AND NOT EXISTS (
       SELECT 1 FROM public.community_blocks b
        WHERE (b.blocker_id = v_uid AND b.blocked_id = p.id)
           OR (b.blocker_id = p.id AND b.blocked_id = v_uid)
     );
  IF v_users IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH m AS (
    SELECT mf.user_id,
           CASE p_metric
             WHEN 'checkin_streak'     THEN mf.checkin_streak
             WHEN 'dose_adherence_30d' THEN mf.dose_adherence_30d
             ELSE mf.workouts_30d
           END AS val
      FROM public._leaderboard_metrics_for(v_users, v_today) mf
  )
  SELECT (rank() OVER (ORDER BY m.val DESC))::integer,
         m.user_id,
         pp.username,
         pp.display_name,
         pp.avatar_url,
         m.val,
         (m.user_id = v_uid)
    FROM m
    JOIN public.public_profiles pp ON pp.id = m.user_id
   WHERE m.val IS NOT NULL
     AND m.val > 0
   ORDER BY m.val DESC, lower(coalesce(pp.display_name, pp.username, '')), m.user_id
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
END;
$$;

-- ── 6. Public: shout-outs ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_community_shoutouts(p_limit integer DEFAULT 20)
RETURNS TABLE (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  kind         text,
  threshold    integer,
  achieved_on  date,
  is_self      boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_users uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- THE GATE — identical to get_community_leaderboard.
  SELECT array_agg(p.id) INTO v_users
    FROM public.profiles p
   WHERE p.leaderboard_opt_in IS TRUE
     AND NOT EXISTS (
       SELECT 1 FROM public.community_blocks b
        WHERE (b.blocker_id = v_uid AND b.blocked_id = p.id)
           OR (b.blocker_id = p.id AND b.blocked_id = v_uid)
     );
  IF v_users IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ev.user_id,
         pp.username,
         pp.display_name,
         pp.avatar_url,
         ev.kind,
         ev.threshold,
         ev.achieved_on,
         (ev.user_id = v_uid)
    FROM public._leaderboard_milestones_for(v_users, v_today) ev
    JOIN public.public_profiles pp ON pp.id = ev.user_id
   ORDER BY ev.achieved_on DESC, ev.threshold DESC, ev.user_id
   LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
END;
$$;

-- ── 7. Public: my own numbers ───────────────────────────────────────────────
-- The caller's own metrics, whether or not they are opted in — it is their own
-- data, which RLS already lets them read row by row.
CREATE OR REPLACE FUNCTION public.get_my_leaderboard_metrics()
RETURNS TABLE (
  checkin_streak     integer,
  dose_adherence_30d integer,
  workouts_30d       integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT mf.checkin_streak, mf.dose_adherence_30d, mf.workouts_30d
    FROM public._leaderboard_metrics_for(ARRAY[v_uid], (now() AT TIME ZONE 'UTC')::date) mf;
END;
$$;

-- ── 8. Grants — name the roles; FROM PUBLIC alone changes nothing ───────────
REVOKE ALL ON FUNCTION public._leaderboard_doses_per_week(text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leaderboard_metrics_for(uuid[], date)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leaderboard_milestones_for(uuid[], date)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_community_leaderboard(text, integer)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_community_shoutouts(integer)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_leaderboard_metrics()               FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_community_leaderboard(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_community_shoutouts(integer)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_leaderboard_metrics()             TO authenticated, service_role;
