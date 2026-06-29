-- ============================================================================
-- check_ins: add respiratory_rate + body_measurements columns
--
-- BUG (P2, silent data loss): useCheckinStore captures `respiratoryRate`
-- (Apple Watch respiratory rate) and `bodyMeasurements` (waist/hip/etc.) in
-- the local CheckInEntry, but the check_ins table never had columns for them.
-- syncRecord() now writes respiratory_rate + body_measurements, and PostgREST
-- would reject the whole row for an unknown column (error swallowed by
-- syncService) — so without these columns every check-in sync would fail.
-- These two metrics were therefore local-only and lost on reinstall /
-- device switch. This migration adds the columns so the data syncs.
--
-- Naming + types mirror the existing check_ins columns:
--   spo2 (INT) / hrv_ms (NUMERIC) for scalar metrics → respiratory_rate NUMERIC
--   sleep_stages (JSONB) for structured blobs        → body_measurements JSONB
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.check_ins DROP COLUMN IF EXISTS respiratory_rate;
--   ALTER TABLE public.check_ins DROP COLUMN IF EXISTS body_measurements;
-- ============================================================================

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS respiratory_rate NUMERIC;

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS body_measurements JSONB;
