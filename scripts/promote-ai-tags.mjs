#!/usr/bin/env node
/**
 * promote-ai-tags.mjs — bulk-authorize every AI-suggested tag.
 *
 * Walks src/data/workoutVideos.json. For each entry where:
 *   - `exerciseId` is null (not yet reviewed)
 *   - `aiSuggested?.exerciseId` is set
 *   - (optionally) `aiSuggested.confidence >= --min-confidence`
 * it promotes the AI's pick to the top-level fields:
 *   exerciseId      ← aiSuggested.exerciseId
 *   category        ← aiSuggested.category
 *   title           ← aiSuggested.title  (only when current title is the
 *                                          placeholder "IMG_XXXX" — never
 *                                          clobbers human-set titles)
 *   needsReview     ← false
 *
 * The original `aiSuggested` block stays intact as an audit trail so we
 * can always tell which entries were human-confirmed vs script-promoted.
 *
 * Skips entries that:
 *   - already have a non-null exerciseId (already reviewed)
 *   - have no aiSuggested.exerciseId (nothing to promote — Jamie still
 *     has to tag these manually in app/admin/video-tagger.tsx)
 *
 * Usage:
 *   node scripts/promote-ai-tags.mjs                       # promote everything ≥0.0
 *   node scripts/promote-ai-tags.mjs --dry-run             # preview, no write
 *   node scripts/promote-ai-tags.mjs --min-confidence 0.85 # only the safer set
 *
 * After running, commit src/data/workoutVideos.json. The runtime
 * fallback in src/services/videoService.ts becomes redundant for the
 * promoted entries (harmless — direct match wins).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(REPO_ROOT, 'src/data/workoutVideos.json');

// ── Arg parsing ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const minConfIdx = args.indexOf('--min-confidence');
const minConfidence =
  minConfIdx >= 0 && args[minConfIdx + 1] != null
    ? parseFloat(args[minConfIdx + 1])
    : 0;

if (Number.isNaN(minConfidence)) {
  console.error('--min-confidence must be a number 0..1');
  process.exit(1);
}

// ── Load ───────────────────────────────────────────────────────────────────
const raw = fs.readFileSync(DATA_PATH, 'utf8');
const videos = JSON.parse(raw);
if (!Array.isArray(videos)) {
  console.error('workoutVideos.json is not an array — refusing to touch it');
  process.exit(1);
}

// ── Walk + promote ─────────────────────────────────────────────────────────
let promoted = 0;
let alreadyReviewed = 0;
let noSuggestion = 0;
let belowThreshold = 0;
let titleUpdated = 0;

for (const v of videos) {
  if (typeof v.exerciseId === 'string' && v.exerciseId.length > 0) {
    alreadyReviewed++;
    continue;
  }
  const sug = v.aiSuggested;
  if (!sug || typeof sug.exerciseId !== 'string' || sug.exerciseId.length === 0) {
    noSuggestion++;
    continue;
  }
  const conf = typeof sug.confidence === 'number' ? sug.confidence : 0;
  if (conf < minConfidence) {
    belowThreshold++;
    continue;
  }

  v.exerciseId = sug.exerciseId;
  if (typeof sug.category === 'string' && sug.category.length > 0) {
    v.category = sug.category;
  }
  // Only replace placeholder titles ("IMG_3681") with the AI suggestion;
  // never clobber a human-edited title.
  if (
    typeof sug.title === 'string' &&
    sug.title.length > 0 &&
    (typeof v.title !== 'string' || /^IMG[_-]\d+/i.test(v.title))
  ) {
    v.title = sug.title;
    titleUpdated++;
  }
  v.needsReview = false;
  promoted++;
}

// ── Report ─────────────────────────────────────────────────────────────────
console.log('─'.repeat(60));
console.log('promote-ai-tags');
console.log('─'.repeat(60));
console.log(`total entries:           ${videos.length}`);
console.log(`already reviewed:        ${alreadyReviewed}`);
console.log(`no AI suggestion:        ${noSuggestion}  (need manual tagger)`);
console.log(`below confidence floor:  ${belowThreshold}  (--min-confidence=${minConfidence})`);
console.log(`promoted this run:       ${promoted}`);
console.log(`titles also updated:     ${titleUpdated}`);
console.log('─'.repeat(60));

if (promoted === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

if (dryRun) {
  console.log('Dry run — workoutVideos.json NOT written.');
  process.exit(0);
}

// ── Write ──────────────────────────────────────────────────────────────────
const out = JSON.stringify(videos, null, 2) + '\n';
fs.writeFileSync(DATA_PATH, out, 'utf8');
console.log(`Wrote ${DATA_PATH}`);
console.log('Next: git add + commit src/data/workoutVideos.json');
