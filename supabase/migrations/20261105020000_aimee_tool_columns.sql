-- Columns Aimee's tools were designed to use (2026-11-05).
--
-- get_user_metrics, summarize_pattern and propose_log_field read and write
-- these, and production never had them, so the tools failed. Adding them
-- rather than narrowing the tools (James: "components like these need to be
-- included, not scrapped").
--
-- Additive only: ADD COLUMN IF NOT EXISTS, nullable, no defaults that rewrite
-- rows, no existing column touched. The backfill fills ONLY the new columns, and
-- only where they are empty, from the user's own health profile. The edge
-- functions feature-detect these columns, so they work before and after this
-- runs.
--
-- profiles.date_of_birth already exists; get_user_metrics reads it as "dob"
-- rather than adding a second copy that could disagree with it.
--
-- Reversible:
--   ALTER TABLE public.check_ins DROP COLUMN IF EXISTS sleep_hours, DROP COLUMN IF EXISTS symptoms;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS height_cm, DROP COLUMN IF EXISTS weight_kg,
--     DROP COLUMN IF EXISTS gender;

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS sleep_hours NUMERIC(4, 2)
    CHECK (sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24)),
  ADD COLUMN IF NOT EXISTS symptoms TEXT[];

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(5, 1),
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5, 1),
  ADD COLUMN IF NOT EXISTS gender TEXT;

-- Backfill from health_profiles.profile (the app's own JSON) — new columns only.
UPDATE public.profiles p
   SET height_cm = COALESCE(p.height_cm, CASE WHEN (hp.profile->'bodyMetrics'->>'heightInches') ~ '^[0-9]{1,3}(\.[0-9]+)?$'
                     THEN CASE WHEN (hp.profile->'bodyMetrics'->>'heightInches')::numeric BETWEEN 20 AND 108
                       THEN ROUND((hp.profile->'bodyMetrics'->>'heightInches')::numeric * 2.54, 1) END END),
       weight_kg = COALESCE(p.weight_kg, CASE WHEN (hp.profile->'bodyMetrics'->>'weightLbs') ~ '^[0-9]{1,4}(\.[0-9]+)?$'
                     THEN CASE WHEN (hp.profile->'bodyMetrics'->>'weightLbs')::numeric BETWEEN 40 AND 1000
                       THEN ROUND((hp.profile->'bodyMetrics'->>'weightLbs')::numeric * 0.45359237, 1) END END),
       gender    = COALESCE(p.gender, NULLIF(hp.profile->>'biologicalSex', ''))
  FROM public.health_profiles hp
 WHERE hp.user_id = p.id
   AND (p.height_cm IS NULL OR p.weight_kg IS NULL OR p.gender IS NULL);
