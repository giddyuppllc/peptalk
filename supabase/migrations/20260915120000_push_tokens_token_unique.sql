-- push_tokens: UNIQUE (expo_push_token), for real this time.
--
-- WHY THIS FILE EXISTS
-- The client (src/services/pushTokenSync.ts) upserts with
-- onConflict: 'expo_push_token'. Postgres only accepts an ON CONFLICT target
-- that matches a unique index or constraint, and production has never had one
-- on that column alone. Checked 2026-09-15 (read-only, pg_indexes /
-- pg_constraint): the only unique constraint is
-- push_tokens_user_id_expo_push_token_key on (user_id, expo_push_token).
-- So every token save since 2026-05-17 has been refused, and the error was
-- only logged under __DEV__. The table holds 1 row, last seen 2026-05-17.
--
-- The change was written on 2026-05-17 as
-- 20260517000000_push_tokens_device_unique.sql and never ran. Commit 3f0dcf6
-- renamed live_message_reports off version 20260517000000, but the ledger had
-- already recorded 20260517000000 under the name live_message_reports (it is
-- recorded twice, at 20260517000000 and 20260517000003). The ledger therefore
-- reports 20260517000000 as applied, `db push` skips it, and the 2026-08-31
-- ledger repair matched on version and did not catch it. That file is now a
-- comment-only pointer to this one; see its header.
--
-- WHAT IT DOES (idempotent; safe to run more than once)
--   1. Adds UNIQUE (expo_push_token) if no constraint of that name exists.
--   2. Drops the old composite constraint, which the new one makes redundant.
--
-- NO DATA IS DELETED
-- The 2026-05-17 version began with a DELETE that de-duplicated tokens. It is
-- not needed today: on 2026-09-15 push_tokens had 1 row and 1 distinct token
-- (read-only count via `supabase db query --linked`), so it would remove 0
-- rows. Rather than carry a DELETE that removes nothing, this migration checks
-- the precondition and stops with an error if duplicates have appeared since.
-- If that ever fires, deciding which row to keep is a data decision, not a
-- migration default.
--
-- A NOTE ON SHARED DEVICES (not changed here)
-- The upsert runs as the signed-in user. When a token already belongs to
-- ANOTHER user, ON CONFLICT DO UPDATE is subject to the UPDATE policy's USING
-- clause (auth.uid() = user_id) on the existing row, so Postgres raises an RLS
-- error instead of reassigning it. With this constraint the second user on a
-- shared device gets that error (now reported to Sentry) rather than a second
-- row. Reassignment across users needs a server-side path; that is a separate
-- decision.
--
-- NOT APPLIED. Apply deliberately, then record it in the ledger.

BEGIN;

DO $$
DECLARE
  dupes integer;
BEGIN
  SELECT count(*) INTO dupes
  FROM (
    SELECT expo_push_token
    FROM public.push_tokens
    GROUP BY expo_push_token
    HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE EXCEPTION
      'push_tokens has % token(s) stored more than once; resolve them before adding UNIQUE (expo_push_token)',
      dupes;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.push_tokens'::regclass
      AND conname = 'push_tokens_expo_push_token_key'
  ) THEN
    ALTER TABLE public.push_tokens
      ADD CONSTRAINT push_tokens_expo_push_token_key UNIQUE (expo_push_token);
  END IF;
END
$$;

ALTER TABLE public.push_tokens
  DROP CONSTRAINT IF EXISTS push_tokens_user_id_expo_push_token_key;

COMMIT;
