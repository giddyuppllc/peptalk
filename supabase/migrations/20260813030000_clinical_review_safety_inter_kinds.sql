-- Two more review surfaces, both bigger than the dosing disagreements:
--   safety — 64 of 79 compounds ship with NO contraindications, no adverse
--            effects and no pregnancy category at all.
--   inter  — the app suggests 139 peptide pairs via `pairsWith` but holds
--            interaction data for only 25, and just 4 of those are cited.
-- `peptide_id` carries a pair key ("a+b") for inter rows.
alter table public.clinical_review_decisions
  drop constraint if exists clinical_review_decisions_kind_check;
alter table public.clinical_review_decisions
  add constraint clinical_review_decisions_kind_check
  check (kind in ('dose','cycle','prov','uncited','edit','safety','inter'));
