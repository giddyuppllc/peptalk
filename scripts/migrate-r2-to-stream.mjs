#!/usr/bin/env node
/**
 * migrate-r2-to-stream.mjs — copy every R2 video into Cloudflare Stream.
 *
 * Calls the migrate-video-to-stream edge function once per manifest entry
 * (only entries that don't already have a streamUid). Stream pulls the
 * video asynchronously and transcodes; we capture the returned UID and
 * write a draft manifest at
 *   supabase/functions/get-workout-video/manifest.draft.json
 *
 * After the script finishes:
 *   1. Eyeball manifest.draft.json — every entry should now have a
 *      streamUid field.
 *   2. `mv manifest.draft.json manifest.json` (or hand-copy)
 *   3. `npx supabase@2.98.2 functions deploy get-workout-video`
 *   4. Wait ~5 min for Stream transcoding to complete on the slowest
 *      videos (Cloudflare's queue, not ours). After that, every signed
 *      URL the client gets points at HLS via Stream.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL   = "https://zniucpbeepxysvkshpir.supabase.co"
 *   $env:SUPABASE_TOKEN = "<admin user access token>"
 *   node scripts/migrate-r2-to-stream.mjs
 *
 * Resumable — checkpoint file at manifest.migrate.progress.json. If the
 * script dies halfway, re-run and it picks up from where it left off.
 *
 * Cost: free (Cloudflare Stream charges for storage + minutes streamed,
 * not for uploads). Time: ~5 minutes for the copy commands to fire.
 * Stream transcoding happens in their cluster afterwards (~1-5 min per
 * video, async).
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
const PROGRESS_PATH = MANIFEST_PATH.replace(/manifest\.json$/, 'manifest.migrate.progress.json');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_TOKEN = process.env.SUPABASE_TOKEN;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '3');
const SLEEP_BETWEEN_MS = Number(process.env.SLEEP_BETWEEN_MS ?? '250');

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL env. Set it to your project URL.');
  process.exit(1);
}
if (!SUPABASE_TOKEN) {
  console.error('Missing SUPABASE_TOKEN env. Get it from the auth session of an admin user.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

let progress = {};
try {
  progress = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
  const done = Object.keys(progress).filter((k) => progress[k].streamUid).length;
  if (done > 0) console.log(`Resuming — ${done} entries already migrated in progress file.`);
} catch {
  /* no progress yet */
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function migrateOne(slug, name, objectKey) {
  const url = `${SUPABASE_URL}/functions/v1/migrate-video-to-stream`;
  const headers = {
    Authorization: `Bearer ${SUPABASE_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (SUPABASE_ANON) headers.apikey = SUPABASE_ANON;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug, name, objectKey }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

const queue = manifest
  .filter((e) => !e.streamUid && !progress[e.slug]?.streamUid)
  .map((e) => ({ slug: e.slug, name: e.title || e.slug, objectKey: e.objectKey }));

console.log(`Migrating ${queue.length} videos R2 → Cloudflare Stream (concurrency=${CONCURRENCY}).`);

let done = 0;
let failed = 0;
const startedAt = Date.now();

async function worker() {
  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) break;
    try {
      const result = await migrateOne(job.slug, job.name, job.objectKey);
      progress[job.slug] = result;
      writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
      done++;
      const total = done + queue.length;
      const pct = total > 0 ? ((done / total) * 100).toFixed(0) : '100';
      console.log(`  [${done}] ${job.slug} → ${result.streamUid ?? '?'} (${result.status}) ${pct}%`);
    } catch (err) {
      failed++;
      console.warn(`  FAIL ${job.slug}: ${err.message ?? err}`);
      progress[job.slug] = { slug: job.slug, error: String(err) };
      writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
    }
    if (SLEEP_BETWEEN_MS > 0) await sleep(SLEEP_BETWEEN_MS);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }).map(() => worker()));

const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0);
console.log(`\nDone — ${done} migrated, ${failed} failed in ${elapsedSec}s.`);

// Merge results into a draft manifest.
const draft = manifest.map((entry) => {
  if (entry.streamUid) return entry; // already migrated
  const p = progress[entry.slug];
  if (!p || !p.streamUid) return entry; // failed or pending
  return {
    ...entry,
    streamUid: p.streamUid,
  };
});

writeFileSync(DRAFT_PATH, JSON.stringify(draft, null, 2));

const newlyMigrated = draft.filter(
  (e) => e.streamUid && !manifest.find((m) => m.slug === e.slug)?.streamUid,
).length;
const stillR2 = draft.filter((e) => !e.streamUid).length;

console.log(`\nDraft manifest: ${DRAFT_PATH}`);
console.log(`  ${newlyMigrated} newly mapped to Stream`);
console.log(`  ${stillR2} entries still R2-only (retry by re-running)`);
console.log('\nNext:');
console.log('  1. Eyeball the draft, replace manifest.json when satisfied.');
console.log('  2. npx supabase@2.98.2 functions deploy get-workout-video');
console.log('  3. Give Cloudflare Stream ~5 min to finish transcoding the queue.');
console.log('  4. Open a workout exercise on the next app build — videos play via HLS.');
