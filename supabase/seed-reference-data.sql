-- ============================================================================
-- Reference Data Tables (admin-updatable, not user-owned)
-- Legacy / optional: these tables aren't used at runtime today (the app
-- loads peptide + stack reference data from local TypeScript constants
-- under src/data/). Kept around for future DB-backed reference data.
-- ============================================================================

-- Peptides reference table
create table if not exists public.peptides (
  id text primary key,
  name text not null,
  abbreviation text,
  categories text[] not null default '{}',
  research_summary text,
  mechanism_of_action text,
  receptor_targets text[] default '{}',
  signaling_pathways text[] default '{}',
  molecular_weight numeric,
  sequence_length integer,
  half_life text,
  stability_notes text,
  storage_temp text,
  primary_uses text[] default '{}',
  common_goals text[] default '{}',
  what_people_report text,
  popular_with text[] default '{}',
  pairs_with text[] default '{}',
  pubmed_links text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Protocols reference table
create table if not exists public.protocols (
  id text primary key,
  peptide_id text not null,
  name text not null,
  route text not null,
  frequency_label text,
  dose_min numeric,
  dose_max numeric,
  dose_unit text,
  duration_weeks_min integer,
  duration_weeks_max integer,
  timing text,
  cycling text,
  reconstitution text,
  storage text,
  synergy_score numeric,
  contraindications text[] default '{}',
  caution_conditions text[] default '{}',
  source text,
  created_at timestamptz not null default now()
);

-- Interactions reference table
create table if not exists public.interactions (
  id text primary key,
  peptide_a text not null,
  peptide_b text not null,
  interaction_type text not null check (interaction_type in ('synergistic', 'neutral', 'competitive', 'contraindicated')),
  synergy_score numeric,
  mechanism_analysis text,
  stability_considerations text,
  chemical_compatibility text,
  research_precedent text,
  pubmed_links text[] default '{}',
  created_at timestamptz not null default now()
);

-- Safety profiles reference table
create table if not exists public.safety_profiles (
  id text primary key,
  peptide_id text not null,
  contraindications text[] default '{}',
  serious_adverse_effects text[] default '{}',
  common_side_effects text[] default '{}',
  drug_interactions jsonb default '[]',
  pregnancy_category text,
  monitoring_required text[] default '{}',
  black_box_warnings text[] default '{}',
  created_at timestamptz not null default now()
);

-- Curated stacks reference table
create table if not exists public.curated_stacks (
  id text primary key,
  name text not null,
  peptide_ids text[] not null default '{}',
  description text,
  target_goals text[] default '{}',
  evidence_level text check (evidence_level in ('established', 'moderate', 'preliminary')),
  curated_by text default 'PepTalk Research Team',
  created_at timestamptz not null default now()
);

-- Exercises reference table
create table if not exists public.exercises (
  id text primary key,
  name text not null,
  primary_muscle text not null,
  secondary_muscles text[] default '{}',
  tags text[] default '{}',
  equipment text[] default '{}',
  difficulty text not null default 'beginner',
  is_time_based boolean not null default false,
  priority text not null default 'P2',
  location text not null default 'any',
  gender text not null default 'anyone',
  metrics text[] default '{}',
  video_url text,
  thumbnail_url text,
  instructions text,
  created_at timestamptz not null default now()
);

-- Allow public read access to all reference tables (no auth needed)
alter table public.peptides enable row level security;
alter table public.protocols enable row level security;
alter table public.interactions enable row level security;
alter table public.safety_profiles enable row level security;
alter table public.curated_stacks enable row level security;
alter table public.exercises enable row level security;

create policy "Public read peptides" on public.peptides for select using (true);
create policy "Public read protocols" on public.protocols for select using (true);
create policy "Public read interactions" on public.interactions for select using (true);
create policy "Public read safety_profiles" on public.safety_profiles for select using (true);
create policy "Public read curated_stacks" on public.curated_stacks for select using (true);
create policy "Public read exercises" on public.exercises for select using (true);

-- Indexes
create index if not exists idx_protocols_peptide on public.protocols(peptide_id);
create index if not exists idx_interactions_peptides on public.interactions(peptide_a, peptide_b);
create index if not exists idx_safety_peptide on public.safety_profiles(peptide_id);
create index if not exists idx_exercises_muscle on public.exercises(primary_muscle);
create index if not exists idx_exercises_priority on public.exercises(priority);
