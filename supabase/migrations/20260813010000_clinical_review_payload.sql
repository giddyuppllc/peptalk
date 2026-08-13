-- Widen clinical review from "pick a winner" to "record the correct answer".
--
-- The first cut stored only a verdict — table / protocol / ladder / other —
-- which meant the reviewer could say which source was wrong but had nowhere to
-- put what the figure should actually be, no way to cite it, and no way to fix
-- the unsupported prose the page was complaining about.
--
-- `payload` holds those edits as jsonb: corrected dose/cycle text, a citation,
-- free notes, and rewritten researchSummary / mechanismOfAction. jsonb rather
-- than more columns because the set of editable fields is still moving, and a
-- migration per field would be worse than a shape the page owns.
--
-- verdict becomes nullable: a row may now exist purely to carry an edit, with
-- no winner chosen.

alter table public.clinical_review_decisions
  add column if not exists payload jsonb;

alter table public.clinical_review_decisions
  alter column verdict drop not null;

comment on column public.clinical_review_decisions.payload is
  'Reviewer edits: {correctedDose, correctedCycle, citation, note, researchSummary, mechanismOfAction}. Shape owned by tools/clinical-review.';
