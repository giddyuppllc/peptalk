-- Remove duplicate dose_logs rows created by repeated taps (2026-08 → 11).
-- A duplicate = same user, peptide, amount, unit, date, time, notes, source,
-- created within 10 seconds of the first copy. The earliest row is kept.
-- Production count at 2026-11-05: 24 groups, 68 extra rows.
--
-- NOT RUN. Review the SELECT first, then run the DELETE inside the same
-- transaction. Backup table first so it is reversible:
--   create table dose_logs_dupes_backup_20261105 as <the SELECT below>;

begin;

with ranked as (
  select id,
         row_number() over (
           partition by user_id, peptide_name, amount, unit, date, time, coalesce(notes, ''), source
           order by created_at, id
         ) as rn,
         first_value(created_at) over (
           partition by user_id, peptide_name, amount, unit, date, time, coalesce(notes, ''), source
           order by created_at, id
         ) as first_at,
         created_at
  from dose_logs
)
select count(*) as rows_to_delete from ranked
 where rn > 1 and created_at - first_at < interval '10 seconds';

-- create table dose_logs_dupes_backup_20261105 as
--   select d.* from dose_logs d join (<ranked CTE> where rn > 1 and created_at - first_at < interval '10 seconds') r using (id);

-- delete from dose_logs where id in (
--   select id from ranked where rn > 1 and created_at - first_at < interval '10 seconds'
-- );

rollback;  -- change to commit once the count matches (expected 68)
