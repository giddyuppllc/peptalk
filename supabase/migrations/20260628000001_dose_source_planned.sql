-- ============================================================================
-- Allow 'planned' as a dose_logs.source value
--
-- BUG (P2, silent sync failure): useDoseLogStore.scheduleCycle writes planned
-- (future scheduled) doses with source:'planned', but the dose_logs.source
-- CHECK constraint (migration 20260423000000) only permits
-- ('user','healthkit','ai_inferred','imported'). Every planned dose therefore
-- fails to upsert and the error is swallowed by syncService — scheduled cycle
-- doses never reach the cloud.
--
-- The inline column CHECK is auto-named dose_logs_source_check by Postgres.
-- ── Rollback ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.dose_logs DROP CONSTRAINT IF EXISTS dose_logs_source_check;
--   ALTER TABLE public.dose_logs ADD CONSTRAINT dose_logs_source_check
--     CHECK (source IN ('user','healthkit','ai_inferred','imported'));
-- ============================================================================

ALTER TABLE public.dose_logs DROP CONSTRAINT IF EXISTS dose_logs_source_check;
ALTER TABLE public.dose_logs ADD CONSTRAINT dose_logs_source_check
  CHECK (source IN ('user', 'healthkit', 'ai_inferred', 'imported', 'planned'));
