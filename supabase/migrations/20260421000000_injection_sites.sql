-- Injection Sites — body map tracking
CREATE TABLE IF NOT EXISTS public.injection_sites (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  side TEXT CHECK (side IN ('left', 'right')),
  peptide_id TEXT,
  peptide_name TEXT,
  date DATE NOT NULL,
  time TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_injection_sites_user_date
  ON public.injection_sites(user_id, date DESC);

-- RLS — only users can see / modify their own injections
SELECT public._apply_user_id_rls('injection_sites');
