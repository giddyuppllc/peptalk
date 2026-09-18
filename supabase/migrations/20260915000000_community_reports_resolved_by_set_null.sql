-- Account deletion fails for any moderator who ever resolved a report.
--
-- 20260503000000_community_phase1.sql declared
--   community_reports.resolved_by UUID REFERENCES auth.users(id)
-- with no ON DELETE clause, which means NO ACTION. delete-user ends with
-- auth.admin.deleteUser(); for a user whose id sits in resolved_by that
-- delete violates the FK and fails, so the in-app "Delete Account" (5.1.1(v))
-- cannot complete for them.
--
-- After: ON DELETE SET NULL, matching the sibling
-- live_message_reports.resolved_by (20260517000003). The report row, its
-- status and resolved_at survive; only the pointer to the deleted account is
-- cleared. No existing row changes when this runs.
--
-- The constraint was created inline, so Postgres named it
-- community_reports_resolved_by_fkey. It is looked up by column rather than
-- by that name, so an environment where it was named differently is handled
-- too, and a re-run is a no-op.
--
-- DOWN (manual, not applied automatically): restores the original NO ACTION.
--   ALTER TABLE public.community_reports
--     DROP CONSTRAINT IF EXISTS community_reports_resolved_by_fkey;
--   ALTER TABLE public.community_reports
--     ADD CONSTRAINT community_reports_resolved_by_fkey
--     FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
-- Rows already nulled by account deletions stay NULL; the down path cannot
-- recover which moderator resolved them.

BEGIN;

DO $$
DECLARE
  fk_name text;
BEGIN
  FOR fk_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.conrelid = 'public.community_reports'::regclass
      AND con.confrelid = 'auth.users'::regclass
      AND att.attname = 'resolved_by'
      AND array_length(con.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.community_reports DROP CONSTRAINT %I', fk_name);
  END LOOP;
END
$$;

ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMIT;
