-- Women's health + integrations schema (1.9.0).
--
-- Four new tables:
--   cycle_period_entries    — menstrual bleed events (start/end, daily flow)
--   cycle_day_logs          — per-day symptom/mood/discharge/BBT/notes
--   contraception_history   — full method timeline
--   connected_integrations  — user's connected biomarker sources
--   allergen_entries        — structured food/drug/environmental allergies
--
-- All tables: user_id FK, standard RLS via _apply_user_id_rls.

-- ── cycle_period_entries ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cycle_period_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  daily_flow JSONB,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cycle_period_user_start ON public.cycle_period_entries(user_id, start_date DESC);

-- ── cycle_day_logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cycle_day_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  flow TEXT CHECK (flow IS NULL OR flow IN ('spotting', 'light', 'medium', 'heavy')),
  symptoms TEXT[] DEFAULT '{}',
  moods TEXT[] DEFAULT '{}',
  discharge TEXT,
  bbt NUMERIC,
  bbt_source TEXT,
  notes TEXT,
  sexual_activity BOOLEAN,
  positive_ovulation_test BOOLEAN,
  positive_pregnancy_test BOOLEAN,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_cycle_day_user_date ON public.cycle_day_logs(user_id, date DESC);

-- ── contraception_history ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contraception_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contraception_user_start ON public.contraception_history(user_id, start_date DESC);

-- ── connected_integrations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.connected_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  connected BOOLEAN DEFAULT FALSE,
  scopes TEXT[] DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  status_message TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, source)
);
CREATE INDEX IF NOT EXISTS idx_integrations_user ON public.connected_integrations(user_id);

-- ── allergen_entries ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.allergen_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('food', 'drug', 'environmental', 'other')),
  label TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe', 'anaphylaxis')),
  notes TEXT,
  reaction_history TEXT,
  diagnosed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_allergen_user ON public.allergen_entries(user_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
SELECT public._apply_user_id_rls('cycle_period_entries');
SELECT public._apply_user_id_rls('cycle_day_logs');
SELECT public._apply_user_id_rls('contraception_history');
SELECT public._apply_user_id_rls('connected_integrations');
SELECT public._apply_user_id_rls('allergen_entries');
