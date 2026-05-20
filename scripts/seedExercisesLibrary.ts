/**
 * Seed the exercises_library table from src/data/jamieExercises.json.
 *
 * Run AFTER the 20260518000000_aimee_real_llm.sql migration applies.
 *   npx tsx scripts/seedExercisesLibrary.ts
 *
 * Idempotent: upserts on id. Re-run safely after data updates.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in supabase/.env.production (or env)
 * because we're writing to a service-role-only table.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../supabase/.env.production') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Add SUPABASE_SERVICE_ROLE_KEY to supabase/.env.production or your shell env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

interface JamieExercise {
  id: string;
  name: string;
  muscles: string[];
  priority?: string;
  level?: string;
  location?: string;
  gender?: string;
  metrics?: string[];
}

async function seed() {
  const jsonPath = path.resolve(__dirname, '../src/data/jamieExercises.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const exercises: JamieExercise[] = JSON.parse(raw);

  console.log(`Loaded ${exercises.length} exercises from ${jsonPath}`);

  const rows = exercises.map((e) => ({
    id: e.id,
    name: e.name,
    muscles: Array.isArray(e.muscles) ? e.muscles : [],
    priority: e.priority ?? null,
    level: e.level ?? null,
    location: e.location ?? null,
    gender: e.gender ?? null,
    metrics: Array.isArray(e.metrics) ? e.metrics : [],
  }));

  // Upsert in batches of 100 — keep payload size small.
  const BATCH = 100;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('exercises_library')
      .upsert(slice, { onConflict: 'id' });
    if (error) {
      console.error(`Batch ${i}..${i + slice.length} failed:`, error);
      process.exit(1);
    }
    upserted += slice.length;
    console.log(`  upserted ${upserted}/${rows.length}`);
  }

  console.log(`Done. ${upserted} exercises in exercises_library.`);
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
