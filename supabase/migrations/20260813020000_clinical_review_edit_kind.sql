-- Allow kind='edit': a row that carries reviewer edits (payload) rather than a
-- verdict on a specific conflict. Keyed per peptide, so one edit row holds the
-- corrected dose/cycle, citation, notes and rewritten prose for that compound.
alter table public.clinical_review_decisions
  drop constraint if exists clinical_review_decisions_kind_check;
alter table public.clinical_review_decisions
  add constraint clinical_review_decisions_kind_check
  check (kind in ('dose','cycle','prov','uncited','edit'));
