-- Duplicate ACTIVE protocols: same user, peptide and start date, from repeated
-- activation taps (the web reminder error made activation look failed).
-- Production at 2026-11-05: 7 groups, 10 extra rows. Keeps the newest row of
-- each group (it carries the last dose the user entered) and deactivates the
-- rest — deactivates, never deletes, so it is reversible.
--
-- NOT RUN. Review the SELECT, then flip the UPDATE on.

begin;

with ranked as (
  select id, row_number() over (
           partition by user_id, peptide_id, start_date
           order by created_at desc, id desc
         ) rn
  from active_protocols
  where is_active
)
select count(*) as rows_to_deactivate from ranked where rn > 1;

-- update active_protocols set is_active = false
--  where id in (select id from ranked where rn > 1);

rollback;  -- change to commit once the count matches (expected 10)
