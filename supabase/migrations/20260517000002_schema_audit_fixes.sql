-- Round 12 schema audit fixes (2026-05-17).
--
-- Consolidates the P0/P1 findings from the schema audit:
--   - P0 #1: missing `side_effect_entries` table (data loss on reinstall)
--   - P0 #2: AFTER trigger silently discards `started_at` write
--   - P0 #3: `aimee_pending_actions` grows unbounded (no purge)
--   - P0 #4: `chat_messages` missing index for thread lookups
--   - P1 #5: CHECK constraint gaps on 1-5 enum columns
--   - P1 #7: missing indexes on stores that .order('created_at')
--   - P1 #8: cycle_period_entries end_date < start_date allowed
--   - P1 #9: purchase_token has no platform-pair constraint
--   - P1 #13: JSONB array columns have no shape validation

BEGIN;

-- ─── P0 #1: side_effect_entries ─────────────────────────────────────────────
-- Master Refactor Plan v3.1 §8.12 + §13.3. The client store
-- (useSideEffectStore) issues syncRecord('side_effect_entries', …) and
-- hydrateFromServer, but no migration created the table. PostgREST
-- returned a 404 that syncService swallowed → side-effect logs silently
-- never round-tripped. Reinstall = data loss.

CREATE TABLE IF NOT EXISTS public.side_effect_entries (
  id              TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symptom         TEXT NOT NULL CHECK (length(symptom) <= 200),
  severity        INT NOT NULL CHECK (severity BETWEEN 1 AND 5),
  linked_dose_id  TEXT,
  peptide_id      TEXT,
  notes           TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_side_effects_user_logged
  ON public.side_effect_entries (user_id, logged_at DESC);

ALTER TABLE public.side_effect_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY side_effects_self_read   ON public.side_effect_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY side_effects_self_insert ON public.side_effect_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY side_effects_self_update ON public.side_effect_entries FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY side_effects_self_delete ON public.side_effect_entries FOR DELETE USING (auth.uid() = user_id);

-- ─── P0 #2: live-event trigger correctness ──────────────────────────────────
-- The original `notify_live_event_broadcast` is declared AFTER but tries to
-- mutate NEW (`NEW.started_at := NOW()`). AFTER triggers can't modify NEW;
-- the assignment is silently discarded and every live event ends up with
-- started_at = NULL. Split into BEFORE (for the timestamp stamp) and AFTER
-- (for the pg_net broadcast).

CREATE OR REPLACE FUNCTION public.stamp_live_event_started_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.started_at IS NULL THEN
    NEW.started_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_live_event_stamp_started_at
  ON public.community_live_events;
CREATE TRIGGER community_live_event_stamp_started_at
  BEFORE INSERT OR UPDATE OF status ON public.community_live_events
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_live_event_started_at();

-- ─── P0 #3: aimee_pending_actions purge ─────────────────────────────────────
-- The table sets expires_at = NOW() + '7 days' but nothing actually deletes
-- expired rows. Add an explicit purge function — call from a pg_cron job
-- (set up out-of-band) or invoke periodically from an edge function. Until
-- the cron is wired, the function is callable manually:
--   SELECT public.purge_expired_aimee_pending_actions();

CREATE OR REPLACE FUNCTION public.purge_expired_aimee_pending_actions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM public.aimee_pending_actions
   WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_aimee_pending_actions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_aimee_pending_actions() TO service_role;

-- ─── P0 #4: chat_messages composite index ───────────────────────────────────
-- `chat_id TEXT` had no index. List-a-single-conversation queries were
-- full per-user table scans.

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_chat_created
  ON public.chat_messages (user_id, chat_id, created_at DESC);

-- ─── P1 #5: CHECK constraints on 1-5 enum columns ───────────────────────────
-- Client clamps to 1-5 but a direct API write with mood:999 was accepted.
-- Add ranges to every column where the client semantics imply one.

ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_mood_range,
  ADD  CONSTRAINT check_ins_mood_range
       CHECK (mood IS NULL OR (mood BETWEEN 1 AND 5));
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_energy_range,
  ADD  CONSTRAINT check_ins_energy_range
       CHECK (energy IS NULL OR (energy BETWEEN 1 AND 5));
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_stress_range,
  ADD  CONSTRAINT check_ins_stress_range
       CHECK (stress IS NULL OR (stress BETWEEN 1 AND 5));
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_recovery_range,
  ADD  CONSTRAINT check_ins_recovery_range
       CHECK (recovery IS NULL OR (recovery BETWEEN 1 AND 5));
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_sleep_quality_range,
  ADD  CONSTRAINT check_ins_sleep_quality_range
       CHECK (sleep_quality IS NULL OR (sleep_quality BETWEEN 1 AND 5));
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_appetite_range,
  ADD  CONSTRAINT check_ins_appetite_range
       CHECK (appetite IS NULL OR (appetite BETWEEN 1 AND 5));
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_spo2_range,
  ADD  CONSTRAINT check_ins_spo2_range
       CHECK (spo2 IS NULL OR (spo2 BETWEEN 50 AND 100));
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_weight_range,
  ADD  CONSTRAINT check_ins_weight_range
       CHECK (weight_lbs IS NULL OR (weight_lbs BETWEEN 40 AND 800));
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_steps_range,
  ADD  CONSTRAINT check_ins_steps_range
       CHECK (steps IS NULL OR (steps BETWEEN 0 AND 100000));
ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_resting_hr_range,
  ADD  CONSTRAINT check_ins_resting_hr_range
       CHECK (resting_heart_rate IS NULL OR (resting_heart_rate BETWEEN 30 AND 200));

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_mood_range,
  ADD  CONSTRAINT journal_entries_mood_range
       CHECK (mood IS NULL OR (mood BETWEEN 1 AND 5));

ALTER TABLE public.workout_logs
  DROP CONSTRAINT IF EXISTS workout_logs_rating_range,
  ADD  CONSTRAINT workout_logs_rating_range
       CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));

-- ─── P1 #7: missing composite indexes for created_at ordering ───────────────

CREATE INDEX IF NOT EXISTS idx_saved_stacks_user_created
  ON public.saved_stacks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pantry_items_user_created
  ON public.pantry_items (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_allergen_entries_user_created
  ON public.allergen_entries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connected_integrations_user_synced
  ON public.connected_integrations (user_id, last_synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_active_protocols_user
  ON public.active_protocols (user_id);

-- ─── P1 #8: cycle_period_entries end_date >= start_date ─────────────────────

ALTER TABLE public.cycle_period_entries
  DROP CONSTRAINT IF EXISTS cycle_period_entries_dates_order,
  ADD  CONSTRAINT cycle_period_entries_dates_order
       CHECK (end_date IS NULL OR end_date >= start_date);

ALTER TABLE public.contraception_history
  DROP CONSTRAINT IF EXISTS contraception_history_dates_order,
  ADD  CONSTRAINT contraception_history_dates_order
       CHECK (end_date IS NULL OR end_date >= start_date);

-- ─── P1 #9: purchase_token / platform consistency ───────────────────────────
-- After Android backfill completes (see migration 20260517000001), the
-- column must be non-null for Android rows and null for iOS rows. We
-- DON'T enforce yet because TestFlight + legacy rows may not be backfilled;
-- comment-only documentation here. Enable in a follow-up migration after
-- verifying backfill is complete:
--
--   ALTER TABLE public.subscriptions
--     ADD CONSTRAINT subscriptions_purchase_token_platform_pair
--     CHECK (
--       (platform = 'android' AND purchase_token IS NOT NULL) OR
--       (platform = 'ios' AND purchase_token IS NULL) OR
--       platform IS NULL
--     );

-- ─── P1 #13: JSONB array shape validation ───────────────────────────────────
-- A buggy client write of `foods: "string instead of array"` would
-- survive INSERT and crash the meal-detail render on every fetch.

ALTER TABLE public.meal_entries
  DROP CONSTRAINT IF EXISTS meal_entries_foods_is_array,
  ADD  CONSTRAINT meal_entries_foods_is_array
       CHECK (foods IS NULL OR jsonb_typeof(foods) = 'array');

ALTER TABLE public.workout_logs
  DROP CONSTRAINT IF EXISTS workout_logs_sets_is_array,
  ADD  CONSTRAINT workout_logs_sets_is_array
       CHECK (sets IS NULL OR jsonb_typeof(sets) = 'array');

COMMIT;

-- Rollback recipe (manual, in case anything above needs reverting):
--
--   BEGIN;
--   DROP TABLE IF EXISTS public.side_effect_entries CASCADE;
--   DROP TRIGGER IF EXISTS community_live_event_stamp_started_at ON public.community_live_events;
--   DROP FUNCTION IF EXISTS public.stamp_live_event_started_at();
--   DROP FUNCTION IF EXISTS public.purge_expired_aimee_pending_actions();
--   DROP INDEX IF EXISTS idx_chat_messages_user_chat_created;
--   DROP INDEX IF EXISTS idx_saved_stacks_user_created;
--   DROP INDEX IF EXISTS idx_pantry_items_user_created;
--   DROP INDEX IF EXISTS idx_allergen_entries_user_created;
--   DROP INDEX IF EXISTS idx_connected_integrations_user_synced;
--   DROP INDEX IF EXISTS idx_active_protocols_user;
--   ALTER TABLE public.check_ins
--     DROP CONSTRAINT IF EXISTS check_ins_mood_range,
--     DROP CONSTRAINT IF EXISTS check_ins_energy_range,
--     -- (etc — drop every check_ins_*_range we added)
--     DROP CONSTRAINT IF EXISTS check_ins_resting_hr_range;
--   ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_mood_range;
--   ALTER TABLE public.workout_logs DROP CONSTRAINT IF EXISTS workout_logs_rating_range;
--   ALTER TABLE public.cycle_period_entries DROP CONSTRAINT IF EXISTS cycle_period_entries_dates_order;
--   ALTER TABLE public.contraception_history DROP CONSTRAINT IF EXISTS contraception_history_dates_order;
--   ALTER TABLE public.meal_entries DROP CONSTRAINT IF EXISTS meal_entries_foods_is_array;
--   ALTER TABLE public.workout_logs DROP CONSTRAINT IF EXISTS workout_logs_sets_is_array;
--   COMMIT;
