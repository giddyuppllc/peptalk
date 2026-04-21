-- AI usage log — per-user, per-function, per-day counters.
--
-- Used by the edge functions to enforce daily rate limits on costly Grok
-- calls (recipe generation, meal plans, pantry-meal suggestions, pantry
-- NL parsing, food-scan vision).
--
-- One row per user+function+date. Counter increments on each call.
-- RLS: users can read their own counters (so the app can show a "used
-- 2/10 recipes today" UI), but only the service role writes.

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_called_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, function_name, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_lookup
  ON public.ai_usage_log(user_id, function_name, date);

-- Read-only for user (via anon/auth key). Writes happen via service role.
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own usage" ON public.ai_usage_log;
CREATE POLICY "Read own usage" ON public.ai_usage_log
  FOR SELECT USING (auth.uid() = user_id);
