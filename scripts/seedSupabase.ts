/**
 * Seed Supabase with reference data from local files.
 *
 * Run: npx tsx scripts/seedSupabase.ts
 *
 * Reads peptides, protocols, interactions, safety profiles, curated stacks,
 * and exercises from src/data/ and upserts them into Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Service role, NOT the anon key.
 *
 * This script used EXPO_PUBLIC_SUPABASE_ANON_KEY, which only worked because
 * peptides / protocols / safety_profiles / interactions / curated_stacks /
 * exercises each carried an "Allow insert/update" RLS policy granted to the
 * `public` role. That key ships inside the published PWA bundle, so those
 * policies let anyone rewrite dosing and contraindications in production.
 * The policies are dropped in 20260813040000; a maintenance script run from a
 * laptop is the right place for the service role instead.
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.\n' +
      'The service role key is required: these reference tables are no longer\n' +
      'writable with the anon key. Supabase dashboard → Project Settings →\n' +
      'API → service_role. Keep it out of the app bundle and out of git.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seedPeptides() {
  // Dynamic import to handle the TS module
  const { PEPTIDES } = await import('../src/data/peptides');
  console.log(`Seeding ${PEPTIDES.length} peptides...`);

  const rows = PEPTIDES.map((p: any) => ({
    id: p.id,
    name: p.name,
    abbreviation: p.abbreviation || null,
    categories: p.categories || [],
    research_summary: p.researchSummary || null,
    mechanism_of_action: p.mechanismOfAction || null,
    receptor_targets: p.receptorTargets || [],
    signaling_pathways: p.signalingPathways || [],
    molecular_weight: typeof p.molecularWeight === 'number' ? p.molecularWeight : (parseFloat(String(p.molecularWeight)) || null),
    sequence_length: p.sequenceLength || null,
    half_life: p.halfLife || null,
    stability_notes: p.stabilityNotes || null,
    storage_temp: p.storageTemp || null,
    primary_uses: p.uses?.primaryUses || [],
    common_goals: p.uses?.commonGoals || [],
    what_people_report: p.uses?.whatPeopleReport || null,
    popular_with: p.uses?.popularWith || [],
    pairs_with: p.uses?.pairsWith || [],
    pubmed_links: p.pubmedLinks || [],
  }));

  const { error } = await supabase.from('peptides').upsert(rows, { onConflict: 'id' });
  if (error) console.error('Peptides error:', error.message);
  else console.log(`✓ ${rows.length} peptides seeded`);
}

async function seedProtocols() {
  const { PROTOCOL_TEMPLATES } = await import('../src/data/protocols');
  console.log(`Seeding ${PROTOCOL_TEMPLATES.length} protocols...`);

  const rows = PROTOCOL_TEMPLATES.map((p: any) => ({
    id: p.id,
    peptide_id: p.peptideId,
    name: p.name,
    route: p.route,
    frequency_label: p.frequencyLabel || null,
    dose_min: p.typicalDose?.min || null,
    dose_max: p.typicalDose?.max || null,
    dose_unit: p.typicalDose?.unit || null,
    duration_weeks_min: p.durationWeeks?.min || null,
    duration_weeks_max: p.durationWeeks?.max || null,
    timing: p.timing || null,
    cycling: p.cycling || null,
    reconstitution: p.reconstitution || null,
    storage: p.storage || null,
    synergy_score: p.synergyScore || null,
    contraindications: p.contraindications || [],
    caution_conditions: p.cautionConditions || [],
    source: p.source || null,
  }));

  const { error } = await supabase.from('protocols').upsert(rows, { onConflict: 'id' });
  if (error) console.error('Protocols error:', error.message);
  else console.log(`✓ ${rows.length} protocols seeded`);
}

async function seedInteractions() {
  const { KNOWN_INTERACTIONS } = await import('../src/data/interactions');
  console.log(`Seeding interactions...`);

  const rows: any[] = [];
  if (KNOWN_INTERACTIONS instanceof Map) {
    KNOWN_INTERACTIONS.forEach((interaction: any, key: string) => {
      const [a, b] = key.split('::');
      rows.push({
        id: key.replace('::', '-x-'),
        peptide_a: a,
        peptide_b: b,
        interaction_type: interaction.interactionType,
        synergy_score: interaction.synergyScore || null,
        mechanism_analysis: interaction.mechanismAnalysis || null,
        stability_considerations: interaction.stabilityConsiderations || null,
        chemical_compatibility: interaction.chemicalCompatibility || null,
        research_precedent: interaction.researchPrecedent || null,
        pubmed_links: interaction.pubmedLinks || [],
      });
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('interactions').upsert(rows, { onConflict: 'id' });
    if (error) console.error('Interactions error:', error.message);
    else console.log(`✓ ${rows.length} interactions seeded`);
  }
}

async function seedSafetyProfiles() {
  const { SAFETY_PROFILES } = await import('../src/data/safetyProfiles');
  console.log(`Seeding ${SAFETY_PROFILES.length} safety profiles...`);

  const rows = SAFETY_PROFILES.map((sp: any) => ({
    id: sp.peptideId,
    peptide_id: sp.peptideId,
    contraindications: sp.contraindications || [],
    serious_adverse_effects: sp.seriousAdverseEffects || [],
    common_side_effects: sp.commonSideEffects || [],
    drug_interactions: sp.drugInteractions || [],
    pregnancy_category: sp.pregnancyCategory || null,
    monitoring_required: sp.monitoringRequired || [],
    black_box_warnings: sp.blackBoxWarnings || [],
  }));

  const { error } = await supabase.from('safety_profiles').upsert(rows, { onConflict: 'id' });
  if (error) console.error('Safety profiles error:', error.message);
  else console.log(`✓ ${rows.length} safety profiles seeded`);
}

async function seedCuratedStacks() {
  const { CURATED_STACKS } = await import('../src/data/curatedStacks');
  console.log(`Seeding ${CURATED_STACKS.length} curated stacks...`);

  const rows = CURATED_STACKS.map((s: any) => ({
    id: s.id,
    name: s.name,
    peptide_ids: s.peptideIds || [],
    description: s.description || null,
    target_goals: s.targetGoals || [],
    evidence_level: s.evidenceLevel || 'preliminary',
    curated_by: s.curatedBy || 'PepTalk Research Team',
  }));

  const { error } = await supabase.from('curated_stacks').upsert(rows, { onConflict: 'id' });
  if (error) console.error('Curated stacks error:', error.message);
  else console.log(`✓ ${rows.length} curated stacks seeded`);
}

async function seedExercises() {
  const exercises = require('../src/data/jamieExercises.json');
  console.log(`Seeding ${exercises.length} exercises...`);

  // Import inference helpers
  const { inferEquipment, inferTimeBased } = await import('../src/data/exercises');

  const MUSCLE_MAP: Record<string, string> = {
    'back': 'back', 'biceps': 'biceps', 'calves': 'calves', 'cardio': 'cardio',
    'chest': 'chest', 'core abdominals': 'core', 'glutes': 'glutes',
    'hamstrings': 'hamstrings', 'quadriceps': 'quads', 'shoulders': 'shoulders',
    'trapezius': 'trapezius', 'triceps': 'triceps',
  };

  const TAG_KEYS = ['circuit cardio', 'circuit lower', 'circuit pull', 'circuit push', 'warm up lower', 'warm up upper'];

  const rows = exercises.map((ex: any) => {
    const muscles: string[] = [];
    const tags: string[] = [];
    (ex.muscles || []).forEach((m: string) => {
      const key = m.toLowerCase().trim();
      if (MUSCLE_MAP[key]) muscles.push(MUSCLE_MAP[key]);
      else if (TAG_KEYS.includes(key)) tags.push(key.replace(/ /g, '_'));
    });

    return {
      id: ex.id,
      name: ex.name,
      primary_muscle: muscles[0] || 'full_body',
      secondary_muscles: muscles.slice(1),
      tags,
      equipment: inferEquipment(ex.name),
      difficulty: ex.level || 'beginner',
      is_time_based: inferTimeBased(ex.name) || (ex.metrics || []).includes('duration'),
      priority: ex.priority || 'P2',
      location: ex.location || 'any',
      gender: ex.gender || 'anyone',
      metrics: ex.metrics || [],
    };
  });

  // Batch in chunks of 50 (Supabase limit)
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await supabase.from('exercises').upsert(chunk, { onConflict: 'id' });
    if (error) console.error(`Exercises batch ${i} error:`, error.message);
  }
  console.log(`✓ ${rows.length} exercises seeded`);
}

async function main() {
  console.log('🌱 Seeding Supabase reference data...\n');
  console.log(`URL: ${SUPABASE_URL}\n`);

  await seedPeptides();
  await seedProtocols();
  await seedInteractions();
  await seedSafetyProfiles();
  await seedCuratedStacks();
  await seedExercises();

  console.log('\n✅ All reference data seeded!');
  console.log('Check your Supabase dashboard: https://supabase.com/dashboard/project/zniucpbeepxysvkshpir/editor');
}

main().catch(console.error);
