-- Predictive engine data layer — source tracking + user-level opt-in.
--
-- This migration is additive. No behavior changes on existing rows; new
-- rows can optionally carry a `source` tag so we can distinguish user-
-- reported data from HealthKit-synced, AI-inferred, or imported data.
--
-- `share_anonymized_data` on profiles is the user's opt-in flag for a
-- future analytics pipeline. Defaults false; settings screen lets them
-- turn it on with a plain-language explanation.

-- ── source column on the logged-data tables ────────────────────────────────
-- Values: 'user' | 'healthkit' | 'ai_inferred' | 'imported'
-- Default 'user' matches the current behavior (everything is self-reported).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'check_ins' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.check_ins ADD COLUMN source TEXT DEFAULT 'user'
      CHECK (source IN ('user', 'healthkit', 'ai_inferred', 'imported'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meal_entries' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.meal_entries ADD COLUMN source TEXT DEFAULT 'user'
      CHECK (source IN ('user', 'healthkit', 'ai_inferred', 'imported'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dose_logs' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.dose_logs ADD COLUMN source TEXT DEFAULT 'user'
      CHECK (source IN ('user', 'healthkit', 'ai_inferred', 'imported'));
  END IF;
END $$;

-- ── Anonymized-data opt-in flag on profiles ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'share_anonymized_data'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN share_anonymized_data BOOLEAN DEFAULT false;
  END IF;
END $$;
