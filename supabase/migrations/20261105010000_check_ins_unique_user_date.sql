-- One check-in per user per day, enforced in the database (2026-11-05).
--
-- check_ins.id was built from the date alone (`checkin-2026-11-03`) and is the
-- table's primary key across ALL users, so only the first account to check in
-- on a given day could sync it; every other user's upsert hit that row and RLS
-- refused it. Production: 16 rows, one per calendar date, from 281 accounts.
-- The client now mints `checkin-<date>-<random>` (src/services/syncService.ts,
-- "Day-keyed ids") and re-keys + re-pushes check-ins that were refused.
--
-- This adds the (user_id, date) uniqueness the app has always assumed, so a
-- second device (or the AI confirm path) cannot create a second row for the
-- same day. cycle_day_logs already has UNIQUE (user_id, date).
--
-- Safe on existing data: verified 2026-11-05 there is at most one row per
-- (user_id, date) (16 rows, 16 distinct pairs). The DO block refuses to run
-- rather than delete anything if that ever stops being true.
--
-- NOT APPLIED. Apply before or after shipping the app — the client keeps
-- upserting on id, so it works either way.
--
-- Reversible: DROP INDEX IF EXISTS check_ins_user_id_date_key;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.check_ins GROUP BY user_id, date HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'check_ins has duplicate (user_id, date) rows — resolve them before adding the unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS check_ins_user_id_date_key
  ON public.check_ins (user_id, date);
