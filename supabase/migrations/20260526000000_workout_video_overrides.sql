-- ─────────────────────────────────────────────────────────────────────────
-- workout_video_overrides — runtime overrides for the workout-video manifest.
-- ─────────────────────────────────────────────────────────────────────────
--
-- Background
-- ----------
-- The workout-video manifest (src/data/workoutVideos.json) is a build-time
-- asset. Jamie tags videos in app/admin/video-tagger.tsx; until now her edits
-- only lived in AsyncStorage on her device and had to be exported to the
-- clipboard and committed into the JSON for a new build. That stranded tags on
-- one device and meant nothing went live without an EAS build.
--
-- This table is the runtime overrides layer the tagger store always promised
-- ("one-line migration to a Supabase overrides table later"). It is keyed by
-- the manifest `slug`. The app merges these rows over the bundled JSON at read
-- time (DB override wins per slug), so Jamie's changes appear WITHOUT a rebuild.
--
-- Columns mirror the editable fields of WorkoutVideo
-- (src/data/workoutVideos.ts): title, description, exercise_id, category,
-- duration_sec, needs_review. The static manifest stays the source of truth for
-- objectKey / aiSuggested / matchConfidence — those are never edited in the
-- tagger, so they are intentionally NOT stored here.
--
-- Auth model
-- ----------
-- Writes go through the `save-workout-overrides` edge function, which validates
-- the caller's email against the ADMIN_EMAILS secret (same pattern as
-- tag-workout-video / get-workout-video's ALLOW_TAGGER_FREE) and upserts with
-- the service-role key. RLS below therefore grants NO write policy to
-- authenticated/anon — only service_role (the edge function) can mutate. Reads
-- are open to any authenticated user so the app can merge overrides on load.

-- 1. Category enum mirrors WorkoutVideoCategory in src/data/workoutVideos.ts.
--    Kept as a CHECK constraint (not a pg enum) so adding a category later is a
--    one-line constraint swap rather than an ALTER TYPE dance.
CREATE TABLE IF NOT EXISTS public.workout_video_overrides (
  slug          TEXT PRIMARY KEY,
  title         TEXT,
  description   TEXT,
  exercise_id   TEXT,
  category      TEXT
                  CHECK (category IS NULL OR category IN (
                    'weight_loss','muscle_gain','muscle_growth','toning',
                    'strength','endurance','longevity','yoga','pilates',
                    'recovery','form_tutorial'
                  )),
  duration_sec  INTEGER,
  needs_review  BOOLEAN,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    TEXT
);

COMMENT ON TABLE public.workout_video_overrides IS
  'Runtime overrides for src/data/workoutVideos.json, keyed by slug. '
  'Written only by the save-workout-overrides edge function (service_role); '
  'read by any authenticated user and merged over the bundled manifest at '
  'app load so Jamie''s tags go live without an EAS build.';

-- 2. RLS — authenticated reads, service-role-only writes.
ALTER TABLE public.workout_video_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workout video overrides readable by authenticated"
  ON public.workout_video_overrides;
CREATE POLICY "Workout video overrides readable by authenticated"
  ON public.workout_video_overrides
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies → authenticated/anon cannot write. The
-- edge function uses the service-role key, which bypasses RLS.
REVOKE ALL ON public.workout_video_overrides FROM PUBLIC;
REVOKE ALL ON public.workout_video_overrides FROM anon;
-- Supabase auto-grants table privileges to `authenticated` via default
-- privileges on the public schema. RLS (default-deny, SELECT-only policy)
-- already blocks writes, but strip the write grants too so write access is
-- locked to service_role at the privilege layer as well (matches the
-- public_profiles hardening intent).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.workout_video_overrides FROM authenticated;
GRANT SELECT ON public.workout_video_overrides TO authenticated;

-- 3. Keep updated_at honest on every write.
CREATE OR REPLACE FUNCTION public.touch_workout_video_overrides_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_workout_video_overrides
  ON public.workout_video_overrides;
CREATE TRIGGER trg_touch_workout_video_overrides
  BEFORE INSERT OR UPDATE
  ON public.workout_video_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_workout_video_overrides_updated_at();
