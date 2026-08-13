-- Clinical review decisions — where Jamie's verdicts land.
--
-- The review page (public/review-*.html) is a standalone static page served
-- from the PWA origin. Until now it stored every verdict in localStorage and
-- relied on the reviewer pressing "Copy decisions" and pasting them back,
-- which meant a closed tab lost the work and a forgotten click lost all of it.
--
-- This table is the durable home for those verdicts. It is written ONLY by the
-- `clinical-review` edge function using the service role — RLS is enabled with
-- no policies, so anon/authenticated clients cannot read or write it directly
-- even though they hold the public anon key.
--
-- NOTE: these rows record a *decision about which source is correct*. They do
-- not change app behaviour on their own — the dosing figures live in
-- src/data/*.ts and ship compiled into the build. Applying a verdict is a code
-- change, deliberately left as a human step.

create table if not exists public.clinical_review_decisions (
  id          uuid primary key default gen_random_uuid(),
  -- which section of the review page the row came from
  kind        text not null check (kind in ('dose', 'cycle', 'prov', 'uncited')),
  peptide_id  text not null,
  -- 'table' | 'protocol' | 'ladder' | 'other' for conflicts; 'checked' for uncited
  verdict     text not null,
  reviewer    text not null default 'unknown',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- one verdict per reviewer per question; re-clicking updates in place
  unique (kind, peptide_id, reviewer)
);

comment on table public.clinical_review_decisions is
  'Human verdicts on dosing-source conflicts. Written only by the clinical-review edge function (service role). Does not drive app behaviour; see src/data/*.ts.';

create index if not exists clinical_review_decisions_kind_idx
  on public.clinical_review_decisions (kind);

alter table public.clinical_review_decisions enable row level security;
-- Intentionally no policies. Service role bypasses RLS; everyone else is denied.
