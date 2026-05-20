#!/usr/bin/env node
/**
 * auto-tag-all-videos.mjs — orchestrator for the tag-workout-video
 * Supabase edge function.
 *
 * Loops every entry in supabase/functions/get-workout-video/manifest.json
 * whose exerciseId is null, calls the tag function for each (server-side
 * Whisper + gpt-4o-mini classifier), and writes a draft manifest at
 *   supabase/functions/get-workout-video/manifest.draft.json
 *
 * Each prediction is annotated with confidence + transcript so the
 * reviewer can spot-check before promoting the draft to the real
 * manifest. High-confidence (>= 0.8) predictions are auto-applied;
 * lower-confidence predictions are written to the draft with a leading
 * "?" so they stand out in a diff (and you can sweep them via the
 * in-app tagger as a follow-up).
 *
 * Usage:
 *   1. Sign in to the app as an ADMIN email (edward@giddyupp.com or
 *      jamieespositofit@gmail.com) and copy your access_token from
 *      the Supabase auth session.
 *      Or: run
 *        npx supabase functions invoke tag-workout-video --no-verify-jwt --body '{"slug":"img-3681"}'
 *      from a logged-in CLI to confirm the function works first.
 *   2. Set env:
 *        $env:SUPABASE_URL    = "https://zniucpbeepxysvkshpir.supabase.co"
 *        $env:SUPABASE_TOKEN  = "<your access token>"
 *   3. Run:
 *        node scripts/auto-tag-all-videos.mjs
 *
 * Estimated runtime: 293 videos × ~6 seconds each = ~30 minutes total.
 * Estimated cost: ~$1.50 in OpenAI API charges (Whisper + gpt-4o-mini).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MANIFEST_PATH = resolve(
  __dirname,
  '..',
  'supabase',
  'functions',
  'get-workout-video',
  'manifest.json',
);
const DRAFT_PATH = MANIFEST_PATH.replace(/manifest\.json$/, 'manifest.draft.json');
const PROGRESS_PATH = MANIFEST_PATH.replace(/manifest\.json$/, 'manifest.draft.progress.json');
const EXERCISES_PATH = resolve(__dirname, '..', 'src', 'data', 'jamieExercises.json');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_TOKEN = process.env.SUPABASE_TOKEN;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
const INTERNAL_KEY = process.env.INTERNAL_MIGRATION_KEY;
const AUTO_APPLY_THRESHOLD = Number(process.env.AUTO_APPLY_THRESHOLD ?? '0.8');
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '2');
const SLEEP_BETWEEN_MS = Number(process.env.SLEEP_BETWEEN_MS ?? '600');
const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? '6');

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL env. Set it to your project URL.');
  process.exit(1);
}
if (!INTERNAL_KEY && !SUPABASE_TOKEN) {
  console.error(
    'Need either INTERNAL_MIGRATION_KEY (preferred) or SUPABASE_TOKEN (admin user JWT).',
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const exerciseRows = JSON.parse(readFileSync(EXERCISES_PATH, 'utf8'));
// Trim to id + name + category for the prompt. The edge function caps
// the list at 600 entries inside its prompt budget.
const exerciseList = exerciseRows.map((e) => ({
  id: e.id,
  name: e.name,
  category: e.category ?? null,
}));

// Resume support — if a previous run left a progress file, re-use it
// so a 30-minute job can pick up where it left off after a network blip.
let progress = {};
try {
  progress = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
  const count = Object.keys(progress).length;
  if (count > 0) console.log(`Resuming — ${count} slugs already tagged in progress file.`);
} catch {
  /* no progress yet */
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tagOne(slug, objectKey, streamUid) {
  const url = `${SUPABASE_URL}/functions/v1/tag-workout-video`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (INTERNAL_KEY) {
    headers['x-internal-key'] = INTERNAL_KEY;
    if (SUPABASE_ANON) headers.Authorization = `Bearer ${SUPABASE_ANON}`;
  } else {
    headers.Authorization = `Bearer ${SUPABASE_TOKEN}`;
  }
  if (SUPABASE_ANON) headers.apikey = SUPABASE_ANON;

  // OpenAI 429s come back inside the edge fn's 200 body (as a "skip"
  // with reason `classifier 429: ...`), not as an HTTP 429. Detect both
  // and retry with exponential backoff so a brief TPM exhaust doesn't
  // turn into 100 dropped tags.
  let lastReason = '';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ slug, objectKey, streamUid, exerciseList }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const isRateLimit = res.status === 429 || /rate.?limit/i.test(text);
      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        const waitMs = Math.min(60_000, 2000 * Math.pow(2, attempt));
        await sleep(waitMs);
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const rateLimited = /classifier 429|rate.?limit/i.test(String(data?.reason ?? ''));
    if (rateLimited && attempt < MAX_RETRIES - 1) {
      lastReason = data.reason;
      const waitMs = Math.min(60_000, 2000 * Math.pow(2, attempt));
      await sleep(waitMs);
      continue;
    }
    return data;
  }
  throw new Error(`rate-limit retries exhausted: ${lastReason.slice(0, 200)}`);
}

// Drop progress entries that hit rate limits or other transient
// errors — those should retry on the next run rather than count as
// final predictions.
for (const slug of Object.keys(progress)) {
  const p = progress[slug];
  const isTransient =
    p?.error ||
    /classifier 429|rate.?limit|HTTP 5\d\d|HTTP 4(29|02)/i.test(String(p?.reason ?? ''));
  if (isTransient) delete progress[slug];
}

const queue = manifest
  .filter((e) => !e.exerciseId && !progress[e.slug])
  .map((e) => ({ slug: e.slug, objectKey: e.objectKey, streamUid: e.streamUid }));
console.log(`Tagging ${queue.length} unmapped videos with concurrency=${CONCURRENCY}.`);

let done = 0;
let failed = 0;
const startedAt = Date.now();

async function worker() {
  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) break;
    const slug = job.slug;
    try {
      const prediction = await tagOne(slug, job.objectKey, job.streamUid);
      progress[slug] = prediction;
      writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
      done++;
      const pct = ((done / (done + queue.length)) * 100).toFixed(0);
      const tag = prediction.exerciseId
        ? `${prediction.exerciseId} (${(prediction.confidence ?? 0).toFixed(2)})`
        : `skip (${prediction.reason ?? 'unknown'})`;
      console.log(`  [${done}] ${slug} → ${tag} ${pct}%`);
    } catch (err) {
      failed++;
      console.warn(`  FAIL ${slug}: ${err.message ?? err}`);
      progress[slug] = { slug, error: String(err) };
      writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
    }
    if (SLEEP_BETWEEN_MS > 0) await sleep(SLEEP_BETWEEN_MS);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }).map(() => worker()));

const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0);
console.log(`\nDone — ${done} tagged, ${failed} failed in ${elapsedSec}s.`);

// Build the draft manifest. Auto-apply predictions whose confidence
// clears the threshold; leave the rest with exerciseId still null so a
// reviewer (or the in-app tagger) can finish them.
const draft = manifest.map((entry) => {
  if (entry.exerciseId) return entry; // already mapped, leave alone
  const p = progress[entry.slug];
  if (!p || !p.exerciseId) {
    return { ...entry, _autoTag: p ?? null };
  }
  const confident = (p.confidence ?? 0) >= AUTO_APPLY_THRESHOLD;
  return {
    ...entry,
    exerciseId: confident ? p.exerciseId : null,
    category: confident ? p.category ?? entry.category ?? null : entry.category,
    needsReview: !confident,
    _autoTag: p,
  };
});

writeFileSync(DRAFT_PATH, JSON.stringify(draft, null, 2));

const applied = draft.filter((e) => e.exerciseId && !manifest.find((m) => m.slug === e.slug)?.exerciseId).length;
const lowConf = draft.filter((e) => e._autoTag?.exerciseId && !e.exerciseId).length;
console.log(`\nDraft manifest written to:\n  ${DRAFT_PATH}`);
console.log(`  ${applied} auto-applied (confidence ≥ ${AUTO_APPLY_THRESHOLD})`);
console.log(`  ${lowConf} flagged for review (low confidence)`);
console.log('\nNext:');
console.log('  1. Review the draft (compare against manifest.json).');
console.log('  2. Copy manifest.draft.json over manifest.json when satisfied.');
console.log('  3. supabase functions deploy get-workout-video');
