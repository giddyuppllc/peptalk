-- Revoke world-writable access to the clinical reference tables.
--
-- THE HOLE
-- peptides, protocols, safety_profiles, interactions, curated_stacks and
-- exercises each carried "Allow insert/update <table>" policies granted to the
-- `public` role with USING true / WITH CHECK true. `public` includes `anon`,
-- and the anon key ships inside the published PWA bundle — so anyone who
-- opened devtools could rewrite dosing, contraindications, drug interactions
-- and the recommended stacks in the production database, or insert unbounded
-- rows into a 300-row exercise table.
--
-- WHY IT EXISTED
-- scripts/seedSupabase.ts authenticated with EXPO_PUBLIC_SUPABASE_ANON_KEY.
-- The policies were the only way that seed could write. The script now uses
-- the service role key, which bypasses RLS, so these are dead weight.
--
-- BLAST RADIUS
-- No client code reads these tables — the app ships its clinical data from
-- src/data/*.ts, compiled into the build. Nothing user-facing changes here.
-- SELECT policies are deliberately left alone: catalog data being readable is
-- intended, and narrowing reads is a separate decision.

drop policy if exists "Allow insert peptides"         on public.peptides;
drop policy if exists "Allow update peptides"         on public.peptides;
drop policy if exists "Allow insert protocols"        on public.protocols;
drop policy if exists "Allow update protocols"        on public.protocols;
drop policy if exists "Allow insert safety_profiles"  on public.safety_profiles;
drop policy if exists "Allow update safety_profiles"  on public.safety_profiles;
drop policy if exists "Allow insert interactions"     on public.interactions;
drop policy if exists "Allow update interactions"     on public.interactions;
drop policy if exists "Allow insert curated_stacks"   on public.curated_stacks;
drop policy if exists "Allow update curated_stacks"   on public.curated_stacks;
drop policy if exists "Allow insert exercises"        on public.exercises;
drop policy if exists "Allow update exercises"        on public.exercises;
