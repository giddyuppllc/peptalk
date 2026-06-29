-- ============================================================================
-- lab_results — cloud sync for user-entered lab panels (P2 data loss fix)
--
-- BUG (P2, silent data loss): useLabResultsStore persisted lab history only to
-- local secureStorage. There was no lab_results table, 'lab_results' was not in
-- syncService's TableName union, and nothing hydrated the store on login. So a
-- reinstall or device switch lost the user's entire lab history (HDL, LDL,
-- HbA1c, testosterone, etc.) — the numbers Aimee reads to answer "is my LDL
-- high?" with the user's real data.
--
-- This adds the table the client store now writes through syncRecord(
-- 'lab_results', …) / deleteRecord and pulls back via hydrateFromServer.
--
-- id is TEXT (not UUID): the store supplies its own stable string id
-- (e.g. 'lab-1719…-ab12'), matching the check_ins / side_effect_entries
-- TEXT-id convention. A UUID column would reject every client write the same
-- way the pre-20260628000000 tables did.
--
-- ref_low / ref_high carry the marker's reference range as it was at entry
-- time (sourced from the LAB_MARKERS catalog client-side) so server-side
-- consumers don't need the catalog to interpret a value.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.lab_results CASCADE;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lab_results (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  marker_id   TEXT NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  unit        TEXT,
  drawn_at    DATE NOT NULL,
  ref_low     DOUBLE PRECISION,
  ref_high    DOUBLE PRECISION,
  notes       TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_results_user_drawn
  ON public.lab_results (user_id, drawn_at DESC);

ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY lab_results_self_read   ON public.lab_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY lab_results_self_insert ON public.lab_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY lab_results_self_update ON public.lab_results FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY lab_results_self_delete ON public.lab_results FOR DELETE USING (auth.uid() = user_id);

COMMIT;
