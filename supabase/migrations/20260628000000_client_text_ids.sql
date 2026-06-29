-- ============================================================================
-- Restore cloud sync: align per-user table primary keys with client ids
--
-- BUG (P0, silent data loss): the Zustand stores generate stable, human-
-- readable string ids (e.g. 'checkin-2026-06-28', 'meal-1719...-ab12',
-- 'int-1719...-x9q2') and syncRecord() upserts them with onConflict:'id'.
-- But these tables were created with `id UUID PRIMARY KEY DEFAULT
-- gen_random_uuid()`, so Postgres rejects every write with
-- "invalid input syntax for type uuid". syncService swallows the error
-- (warns only in __DEV__), so the failure is invisible: NONE of this data
-- has ever reached the cloud — no backup, no cross-device sync.
--
-- These string ids are intentional (idempotency — one check-in per date,
-- one integration row per source, etc.), and three sibling tables that
-- post-date the bug were already created with TEXT ids (chat_messages,
-- injection_sites, side_effect_entries). So the correct, lowest-risk fix
-- is to make the id columns TEXT to match what the client sends, rather
-- than rewrite every store + migrate local data to UUIDs (which would
-- break the per-date / per-source upsert dedup).
--
-- Safe because: (1) these are leaf tables — no other table has an inbound
-- FK to their id (verified); (2) since sync never worked, the columns are
-- empty in production, so the USING id::text cast touches no rows; (3) the
-- gen_random_uuid() default is dropped because the client always supplies
-- the id.
--
-- active_protocols is intentionally NOT included — it is local-only (never
-- written through syncRecord).
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- Only safe while the tables are empty (string ids won't cast back to UUID):
--   ALTER TABLE public.<t> ALTER COLUMN id TYPE UUID USING id::uuid;
--   ALTER TABLE public.<t> ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'check_ins',
    'journal_entries',
    'dose_logs',
    'meal_entries',
    'workout_logs',
    'saved_stacks',
    'cycle_period_entries',
    'cycle_day_logs',
    'contraception_history',
    'pantry_items',
    'allergen_entries',
    'connected_integrations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop the uuid default (client always supplies the id), then widen to TEXT.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id DROP DEFAULT;', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id TYPE TEXT USING id::text;', t);
  END LOOP;
END $$;
