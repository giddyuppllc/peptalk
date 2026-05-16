-- ============================================================================
-- Aimee Real-LLM upgrade — Claude Sonnet 4.6 backend, tool-calling, cost cap
-- ============================================================================
--
-- Adds three tables that the new `aimee-chat-stream` edge function depends on:
--
--   1. aimee_cost_cents        — dollar-aware daily cost ledger (per user + global)
--   2. aimee_pending_actions   — operator-confirm queue for destructive tool calls
--   3. exercises_library       — the 451-exercise catalogue, loaded once + queried
--                                by the `suggest_workout` tool
--
-- Why dollar-aware: the existing ai_usage_log is a per-message COUNTER (e.g.
-- "300 chats/day"). It cannot stop a runaway cost incident — a single very-long
-- response can burn $1+ on Claude. The new ledger tracks REAL token spend in
-- microcents (1/1,000,000 of a dollar) so we can enforce a real $/day cap.
--
-- All tables: RLS enabled; users see only their own rows; service role writes.
-- ============================================================================

-- ── 1. aimee_cost_cents ─────────────────────────────────────────────────────
-- One row per (user_id, date). Updated by the edge function after every
-- Anthropic call. The edge function ALSO maintains a global aggregate row
-- (user_id = '00000000-0000-0000-0000-000000000000') so we can enforce a
-- system-wide ceiling without scanning every user row on each request.

CREATE TABLE IF NOT EXISTS public.aimee_cost_cents (
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  -- microcents = (cents * 1_000_000). Stored as bigint to fit large numbers.
  -- 1 USD = 100,000,000 microcents. A $10/day budget = 1,000,000,000.
  spend_microcents BIGINT NOT NULL DEFAULT 0,
  call_count INTEGER NOT NULL DEFAULT 0,
  last_called_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_aimee_cost_user_date
  ON public.aimee_cost_cents(user_id, date DESC);

ALTER TABLE public.aimee_cost_cents ENABLE ROW LEVEL SECURITY;

-- Users may SELECT their own spend (powers a "you've used $X.XX today" UI).
DROP POLICY IF EXISTS "Read own aimee spend" ON public.aimee_cost_cents;
CREATE POLICY "Read own aimee spend" ON public.aimee_cost_cents
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy for the user — service role only.

COMMENT ON TABLE public.aimee_cost_cents IS
  'Daily Anthropic token-cost ledger for Aimee. Microcents = cents × 1,000,000. Service role writes only. The global daily aggregate uses sentinel user_id 00000000-0000-0000-0000-000000000000.';

-- ── 2. aimee_pending_actions ────────────────────────────────────────────────
-- Operator-confirm queue. When Aimee calls a tool that writes user data
-- (log-a-field, save-a-meal-template, etc.), the edge function records the
-- proposed action here and returns its id to the client. The user sees a
-- Confirm/Edit/Cancel modal in the RN app; on Confirm, a separate endpoint
-- promotes the row into the target table; on Cancel, status flips to
-- 'cancelled' and we never write user data.

DO $$ BEGIN
  CREATE TYPE public.aimee_action_status AS ENUM
    ('pending', 'confirmed', 'cancelled', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.aimee_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id TEXT,
  -- The tool the model called. One of:
  --   suggest_workout, draft_meal_template, summarize_pattern, propose_log_field
  -- (suggest_workout + summarize_pattern are non-destructive and may auto-
  -- confirm; we still log them for replay + audit.)
  tool_name TEXT NOT NULL,
  -- Tool-call input JSON, verbatim from the model.
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Tool-call output JSON (the proposed action). What the UI displays.
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.aimee_action_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Expire pending rows after 7 days so the queue doesn't grow unbounded.
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_aimee_pending_user_status
  ON public.aimee_pending_actions(user_id, status, created_at DESC);

ALTER TABLE public.aimee_pending_actions ENABLE ROW LEVEL SECURITY;

-- Users may SELECT their own pending actions (for the confirm modal).
DROP POLICY IF EXISTS "Read own aimee actions" ON public.aimee_pending_actions;
CREATE POLICY "Read own aimee actions" ON public.aimee_pending_actions
  FOR SELECT USING (auth.uid() = user_id);

-- Users may UPDATE their own pending actions to flip status to cancelled.
-- Confirming + acting on the action is service-role-only via the edge fn.
DROP POLICY IF EXISTS "Cancel own aimee actions" ON public.aimee_pending_actions;
CREATE POLICY "Cancel own aimee actions" ON public.aimee_pending_actions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status IN ('cancelled'));

COMMENT ON TABLE public.aimee_pending_actions IS
  'Operator-confirm queue. Aimee proposes; the user confirms via the RN modal; the edge function commits. Auto-expires after 7 days.';

-- ── 3. exercises_library ────────────────────────────────────────────────────
-- The 451-exercise catalogue (Jamie Esposito's curated library). Seeded from
-- src/data/jamieExercises.json. Aimee's suggest_workout tool queries this
-- via filtered SELECT (muscle_group + difficulty + equipment + gender) so
-- the model can surface REAL exercises, not invented ones.

CREATE TABLE IF NOT EXISTS public.exercises_library (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Stored as text[] so we can filter on contains-any.
  muscles TEXT[] NOT NULL DEFAULT '{}',
  priority TEXT,            -- P1 / P2 / P3 / P4
  level TEXT,               -- beginner / intermediate / advanced
  location TEXT,            -- any / home / gym
  gender TEXT,              -- anyone / men / women
  metrics TEXT[] NOT NULL DEFAULT '{}',  -- ['reps','weight','duration']
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercises_muscles
  ON public.exercises_library USING GIN (muscles);
CREATE INDEX IF NOT EXISTS idx_exercises_lookup
  ON public.exercises_library (level, location, gender, priority);

ALTER TABLE public.exercises_library ENABLE ROW LEVEL SECURITY;

-- Public-read (it's a catalogue, not user data). Service role writes.
DROP POLICY IF EXISTS "Anyone can read exercises" ON public.exercises_library;
CREATE POLICY "Anyone can read exercises" ON public.exercises_library
  FOR SELECT USING (true);

COMMENT ON TABLE public.exercises_library IS
  'Curated 451-exercise library (Jamie Esposito). Seeded once from src/data/jamieExercises.json. Queried by Aimee suggest_workout tool.';
