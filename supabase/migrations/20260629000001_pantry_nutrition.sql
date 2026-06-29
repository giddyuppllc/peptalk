-- ============================================================================
-- pantry_items: add nutrition column
--
-- BUG (P2, silent data loss): usePantryStore captures a per-item `nutrition`
-- snapshot (per-serving macros + serving label) in the local PantryItem, but
-- the pantry_items table never had a column for it. toSupabaseRow() now writes
-- `nutrition`, and PostgREST would reject the whole row for an unknown column
-- (error swallowed by syncService) — so without this column every pantry sync
-- would fail. The nutrition snapshot was therefore local-only and lost on
-- reinstall / device switch. This migration adds the column so the data syncs.
--
-- Type mirrors the existing JSONB snapshot pattern (check_ins.body_measurements).
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.pantry_items DROP COLUMN IF EXISTS nutrition;
-- ============================================================================

ALTER TABLE public.pantry_items
  ADD COLUMN IF NOT EXISTS nutrition JSONB;
