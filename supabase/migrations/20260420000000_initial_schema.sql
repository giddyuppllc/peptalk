-- ============================================================================
-- PepTalk — complete initial schema with RLS
--
-- Paste into Supabase SQL editor:
-- https://supabase.com/dashboard/project/zniucpbeepxysvkshpir/sql/new
--
-- Safe to re-run: every CREATE uses IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES — one row per auth user, created automatically on signup
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'plus', 'pro')),
  is_pro BOOLEAN DEFAULT FALSE,
  favorite_peptides TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: auto-create profile row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. CHECK_INS — daily wellness check-ins
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  mood INT,
  energy INT,
  stress INT,
  recovery INT,
  sleep_quality INT,
  appetite INT,
  weight_lbs NUMERIC,
  resting_heart_rate INT,
  steps INT,
  hrv_ms NUMERIC,
  vo2_max NUMERIC,
  spo2 INT,
  notes TEXT,
  emotion_tags TEXT[] DEFAULT '{}',
  side_effect_tags TEXT[] DEFAULT '{}',
  peptide_effects JSONB DEFAULT '[]',
  sleep_stages JSONB,
  active_calories NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_check_ins_user_date ON public.check_ins(user_id, date DESC);

-- ----------------------------------------------------------------------------
-- 3. DOSE_LOGS — peptide injection/dose records
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dose_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peptide_id TEXT,
  peptide_name TEXT,
  amount NUMERIC,
  unit TEXT,
  route TEXT,
  date DATE NOT NULL,
  time TEXT,
  site TEXT,
  batch_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dose_logs_user_date ON public.dose_logs(user_id, date DESC);

-- ----------------------------------------------------------------------------
-- 4. ACTIVE_PROTOCOLS — recurring dose schedules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.active_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peptide_id TEXT,
  peptide_name TEXT,
  dose_amount NUMERIC,
  dose_unit TEXT,
  route TEXT,
  frequency TEXT,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. MEAL_ENTRIES — logged meals
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type TEXT,
  timestamp TIMESTAMPTZ,
  foods JSONB DEFAULT '[]',
  quick_log JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meal_entries_user_date ON public.meal_entries(user_id, date DESC);

-- ----------------------------------------------------------------------------
-- 6. WORKOUT_LOGS — completed workout sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INT,
  program_id TEXT,
  day_id TEXT,
  sets JSONB DEFAULT '[]',
  rating INT,
  notes TEXT,
  workout_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON public.workout_logs(user_id, started_at DESC);

-- ----------------------------------------------------------------------------
-- 7. CHAT_MESSAGES — Aimee conversation history
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT,
  role TEXT CHECK (role IN ('user', 'bot', 'assistant')),
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON public.chat_messages(user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 8. JOURNAL_ENTRIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  title TEXT,
  category TEXT,
  content TEXT,
  tags TEXT[] DEFAULT '{}',
  related_peptide_ids TEXT[] DEFAULT '{}',
  mood INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journal_user_date ON public.journal_entries(user_id, date DESC);

-- ----------------------------------------------------------------------------
-- 9. SAVED_STACKS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_stacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  peptides TEXT[] DEFAULT '{}',
  target_goals TEXT[] DEFAULT '{}',
  notes TEXT,
  is_curated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. HEALTH_PROFILES — comprehensive health questionnaire data (PHI)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile JSONB DEFAULT '{}',
  setup_complete BOOLEAN DEFAULT FALSE,
  current_step INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. SUBSCRIPTIONS — IAP purchase records + current tier
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('plus', 'pro')),
  platform TEXT CHECK (platform IN ('ios', 'android')),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  last_validated_at TIMESTAMPTZ DEFAULT NOW(),
  receipt_data TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active ON public.subscriptions(user_id, is_active);

-- ============================================================================
-- ROW LEVEL SECURITY — enable + policies for every table
-- ============================================================================

-- Helper to (re)create identical "own-row" policies on any table with user_id
CREATE OR REPLACE FUNCTION public._apply_user_id_rls(tbl TEXT) RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "Own rows select" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "Own rows insert" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "Own rows update" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "Own rows delete" ON public.%I', tbl);
  EXECUTE format('CREATE POLICY "Own rows select" ON public.%I FOR SELECT USING (auth.uid() = user_id)', tbl);
  EXECUTE format('CREATE POLICY "Own rows insert" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', tbl);
  EXECUTE format('CREATE POLICY "Own rows update" ON public.%I FOR UPDATE USING (auth.uid() = user_id)', tbl);
  EXECUTE format('CREATE POLICY "Own rows delete" ON public.%I FOR DELETE USING (auth.uid() = user_id)', tbl);
END;
$$ LANGUAGE plpgsql;

SELECT public._apply_user_id_rls('check_ins');
SELECT public._apply_user_id_rls('dose_logs');
SELECT public._apply_user_id_rls('active_protocols');
SELECT public._apply_user_id_rls('meal_entries');
SELECT public._apply_user_id_rls('workout_logs');
SELECT public._apply_user_id_rls('chat_messages');
SELECT public._apply_user_id_rls('journal_entries');
SELECT public._apply_user_id_rls('saved_stacks');
SELECT public._apply_user_id_rls('health_profiles');
SELECT public._apply_user_id_rls('subscriptions');

-- Profiles uses `id` instead of `user_id`
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own profile select" ON public.profiles;
DROP POLICY IF EXISTS "Own profile update" ON public.profiles;
DROP POLICY IF EXISTS "Own profile insert" ON public.profiles;
CREATE POLICY "Own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================================
-- Verification query — run after migration to confirm all tables have RLS
-- ============================================================================
-- SELECT tablename, rowsecurity AS rls_enabled,
--   (SELECT count(*) FROM pg_policies WHERE pg_policies.tablename = t.tablename) AS policy_count
-- FROM pg_tables t
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
