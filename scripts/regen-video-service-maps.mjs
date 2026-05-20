#!/usr/bin/env node
/**
 * regen-video-service-maps.mjs — regenerate the EXERCISE_VIDEO_SLUG_MAP +
 * EXERCISE_VIDEO_SLUGS + UNTAGGED_VIDEO_SLUGS blocks in
 * src/services/videoService.ts from the current server manifest.
 *
 * Use after the vision tagger lands new exerciseId mappings in
 * supabase/functions/get-workout-video/manifest.json.
 *
 * Reads manifest.json, groups entries by exerciseId, sorts each group
 * by `_autoTag.confidence` descending so the highest-confidence take is
 * canonical (index 0). Prints a ready-to-paste TS block to stdout.
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

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

const byEx = {};
const untagged = [];
for (const e of manifest) {
  if (e.exerciseId) {
    if (!byEx[e.exerciseId]) byEx[e.exerciseId] = [];
    byEx[e.exerciseId].push(e);
  } else {
    untagged.push(e.slug);
  }
}

// Sort within each exercise group by confidence (highest first), then slug
for (const id of Object.keys(byEx)) {
  byEx[id].sort((a, b) => {
    const ca = a._autoTag?.confidence ?? 0;
    const cb = b._autoTag?.confidence ?? 0;
    if (cb !== ca) return cb - ca;
    return a.slug.localeCompare(b.slug);
  });
}

const sortedIds = Object.keys(byEx).sort();
const totalTakes = sortedIds.reduce((n, id) => n + byEx[id].length, 0);

let out = '';
out += `// Auto-regenerated ${new Date().toISOString().slice(0, 10)} from\n`;
out += `// supabase/functions/get-workout-video/manifest.json (vision tagger).\n`;
out += `// ${sortedIds.length} exercises × ${totalTakes} takes.\n`;
out += `const EXERCISE_VIDEO_SLUG_MAP: Record<string, string> = {\n`;
for (const id of sortedIds) {
  out += `  '${id}': '${byEx[id][0].slug}',\n`;
}
out += `};\n\n`;

out += `// MULTI-TAKE COVERAGE — canonical first, then alt angles sorted by\n`;
out += `// AI confidence. UI consumes via getAllExerciseVideoSlugs(exerciseId).\n`;
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
