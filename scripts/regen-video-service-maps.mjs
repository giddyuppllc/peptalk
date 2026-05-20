#!/usr/bin/env node
/**
 * regen-video-service-maps.mjs — regenerate the EXERCISE_VIDEO_SLUG_MAP +
 * EXERCISE_VIDEO_SLUGS + UNTAGGED_VIDEO_SLUGS blocks in
 * src/services/videoService.ts.
 *
 * Wave 76.40 update: MERGE strategy — trust the manually-reviewed tags
 * in src/data/workoutVideos.json (Jamie's hand-reviewed + high-confidence
 * Grok pass) as the canonical truth, and only borrow the vision tagger's
 * predictions from supabase/.../manifest.json for slugs that have NO
 * existing tag in workoutVideos. This avoids the gpt-4o-mini
 * over-confidence problem where it relabeled a manually-confirmed
 * plank as a push-up at 0.95 confidence.
 *
 * Groups by exerciseId, sorts each group by confidence (manual = 1.0,
 * vision uses _autoTag.confidence), prints a ready-to-paste TS block
 * to stdout.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MANIFEST = resolve(
  __dirname,
  '..',
  'supabase',
  'functions',
  'get-workout-video',
  'manifest.json',
);
const REVIEWED = resolve(
  __dirname,
  '..',
  'src',
  'data',
  'workoutVideos.json',
);

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const reviewed = JSON.parse(readFileSync(REVIEWED, 'utf8'));

// workoutVideos.json has duplicate entries per slug; the higher-confidence
// or `reviewed === true` row should win.
const reviewedBySlug = {};
for (const v of reviewed) {
  const prev = reviewedBySlug[v.slug];
  if (!prev) {
    reviewedBySlug[v.slug] = v;
    continue;
  }
  const score = (row) =>
    (row.reviewed === true ? 100 : 0) + (row?.aiSuggested?.confidence ?? 0);
  if (score(v) > score(prev)) reviewedBySlug[v.slug] = v;
}

// Stats for the report header.
let fromReviewed = 0, fromVision = 0, untaggedCount = 0;

const byEx = {};
const untagged = [];
for (const e of manifest) {
  const we = reviewedBySlug[e.slug];
  // Pick canonical exerciseId: reviewed source wins if it has a tag;
  // otherwise fall back to vision tagger's prediction.
  let exerciseId = we?.exerciseId ?? null;
  let source = 'reviewed';
  let confidence = we?.aiSuggested?.confidence ?? (exerciseId ? 1 : 0);
  if (!exerciseId && e.exerciseId) {
    exerciseId = e.exerciseId;
    source = 'vision';
    confidence = e._autoTag?.confidence ?? 0;
    fromVision++;
  } else if (!exerciseId && e._autoTag?.exerciseId && (e._autoTag?.confidence ?? 0) >= 0.6) {
    // Wave 76.41 widen: also accept sub-threshold vision predictions
    // (0.6–0.8) for slugs neither reviewed nor auto-applied. These
    // wouldn't pass the auto-apply bar but are better than no mapping
    // at all when nothing else exists.
    exerciseId = e._autoTag.exerciseId;
    source = 'vision-lowconf';
    confidence = e._autoTag.confidence ?? 0;
    fromVision++;
  } else if (exerciseId) {
    fromReviewed++;
  }
  if (!exerciseId) {
    untagged.push(e.slug);
    untaggedCount++;
    continue;
  }
  if (!byEx[exerciseId]) byEx[exerciseId] = [];
  byEx[exerciseId].push({ slug: e.slug, source, confidence });
}

// Sort within each exercise group: reviewed entries first, then by
// confidence descending, then by slug for stability.
for (const id of Object.keys(byEx)) {
  byEx[id].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'reviewed' ? -1 : 1;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.slug.localeCompare(b.slug);
  });
}

const sortedIds = Object.keys(byEx).sort();
const totalTakes = sortedIds.reduce((n, id) => n + byEx[id].length, 0);

let out = '';
out += `// Auto-regenerated ${new Date().toISOString().slice(0, 10)} by\n`;
out += `// scripts/regen-video-service-maps.mjs (merge mode).\n`;
out += `// ${sortedIds.length} exercises × ${totalTakes} takes —\n`;
out += `// ${fromReviewed} from reviewed src/data/workoutVideos.json + ${fromVision} new\n`;
out += `// from the vision tagger for slugs with no prior manual tag.\n`;
out += `// ${untaggedCount} slugs still untagged (in UNTAGGED_VIDEO_SLUGS below).\n`;
out += `const EXERCISE_VIDEO_SLUG_MAP: Record<string, string> = {\n`;
for (const id of sortedIds) {
  out += `  '${id}': '${byEx[id][0].slug}',\n`;
}
out += `};\n\n`;

out += `// MULTI-TAKE COVERAGE — canonical first, then alt angles. Reviewed\n`;
out += `// (manually-vetted) takes come before vision-tagger takes, then by\n`;
out += `// confidence. UI consumes via getAllExerciseVideoSlugs(exerciseId).\n`;
out += `const EXERCISE_VIDEO_SLUGS: Record<string, readonly string[]> = {\n`;
for (const id of sortedIds) {
  const slugs = byEx[id].map((e) => `'${e.slug}'`).join(', ');
  out += `  '${id}': [${slugs}],\n`;
}
out += `};\n\n`;

out += `// ${untagged.length} videos still untagged — surfaced only via the in-app\n`;
out += `// admin tagger so nothing in Stream sits orphaned.\n`;
out += `const UNTAGGED_VIDEO_SLUGS: readonly string[] = [\n`;
const chunk = (arr, n) => arr.reduce((acc, x, i) => {
  if (i % n === 0) acc.push([]);
  acc[acc.length - 1].push(x);
  return acc;
}, []);
for (const row of chunk(untagged.sort(), 5)) {
  out += `  ${row.map((s) => `'${s}'`).join(', ')},\n`;
}
out += `];\n`;

process.stdout.write(out);
