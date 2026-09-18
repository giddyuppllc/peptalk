-- SS-31 dose correction — public.protocols reference row.
--
-- NOT A MIGRATION, and deliberately not in supabase/migrations/: `supabase db
-- push` would apply it unreviewed. It changes stored data, so it runs only when
-- Edward chooses to run it.
--
-- WHAT: proto-ss31 dose 5–40 mg -> 2–5 mg.
-- WHO:  Jamie Esposito (text, 13–14 Sep 2026, via Edward work order 2026-09-15):
--       "SS-31 = 2–5 mg daily; 2 mg beginner, 5 mg advanced."
-- WHY THIS ROW: scripts/seedSupabase.ts copied protocols.ts into this table.
--       Read live (anon, read-only) on 2026-09-15: dose_min 5, dose_max 40,
--       dose_unit mg. No client or edge function reads public.protocols today
--       (see migration 20260813040000), so this is for agreement, not a
--       user-visible fix. The app's values ship in the bundle.
--
-- Guarded on the old values so a re-run, or a row someone already fixed, is a
-- no-op rather than an overwrite. Expect "UPDATE 1" the first time.

begin;

update public.protocols
   set dose_min = 2,
       dose_max = 5
 where id = 'proto-ss31'
   and dose_unit = 'mg'
   and dose_min = 5
   and dose_max = 40;

-- Should return exactly one row: proto-ss31 | 2 | 5 | mg
select id, dose_min, dose_max, dose_unit
  from public.protocols
 where peptide_id = 'ss-31';

commit;
