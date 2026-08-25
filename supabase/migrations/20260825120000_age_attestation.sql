-- ============================================================================
-- Server-side proof that the 18+ age gate was enforced.
--
-- WHY
-- Onboarding blocks progression below 18 (canContinue requires
-- selectedAge >= 18) and the lowest stored bucket is '18-29', so the gate is
-- real. But the answer lived ONLY on the device: useOnboardingStore has no
-- server sync and nothing wrote age to profiles. We could show a reviewer the
-- gate in the code and could not demonstrate that any given account had passed
-- through it.
--
-- That matters now for two reasons. The app declares User-Generated Content and
-- social features to Apple and Google, which is what actually drives an age
-- rating; and until 2026-08-25 the /auth Sign Up tab created accounts without
-- asking age at all, so "the gate exists" was not the same as "every account
-- passed it".
--
-- WHAT IS STORED — deliberately minimal
--   age_range        the bucket the user selected ('18-29' … '61+'), never an
--                    exact age or date of birth. Enough to prove the gate ran,
--                    not enough to be a new PII liability.
--   age_attested_at  when they answered.
--   age_gate_min     the minimum the app REQUIRED at that moment. Recording the
--                    policy in force means a later change to the threshold does
--                    not retroactively invalidate what earlier accounts proved.
--
-- NULL is meaningful: it marks an account created before this shipped, or one
-- that arrived through the signup path that skipped onboarding. Those are
-- exactly the accounts worth being able to identify, so they are not
-- backfilled with a guess.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.profiles
--     DROP COLUMN IF EXISTS age_range,
--     DROP COLUMN IF EXISTS age_attested_at,
--     DROP COLUMN IF EXISTS age_gate_min;
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_range       TEXT,
  ADD COLUMN IF NOT EXISTS age_attested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_gate_min    SMALLINT;

COMMENT ON COLUMN public.profiles.age_range IS
  'Self-declared age bucket from onboarding. Never an exact age or DOB.';
COMMENT ON COLUMN public.profiles.age_attested_at IS
  'When the user passed the age gate. NULL = never attested (pre-dates the column, or signed up before onboarding asked).';
COMMENT ON COLUMN public.profiles.age_gate_min IS
  'Minimum age the app enforced at attestation time, so a later policy change does not invalidate earlier proof.';
