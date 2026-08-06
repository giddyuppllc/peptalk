/**
 * verify:videos — keep the workout-video pipeline joined up.
 *
 * There are four separate pieces and they drift independently:
 *
 *   src/data/workoutVideos.json          the manifest Jamie tags (311 clips)
 *   src/data/jamieExercises.json         the exercises (384)
 *   src/services/videoService.ts         exerciseId -> slug, hand-pasted from
 *                                        scripts/regen-video-service-maps.mjs
 *   supabase/functions/get-workout-video/manifest.json
 *                                        the server allowlist that signs URLs
 *
 * Every join is a silent one. A video tagged to an exerciseId that no exercise
 * has is invisible forever. A map entry whose slug is missing from the server
 * allowlist gives the user a play button that errors. Nothing in the app or the
 * build says so, which is the same failure that hid 24 dosing rows.
 *
 * The regen script only PRINTS a block for a human to paste, so the map rots
 * quietly between runs. This check is what makes that visible.
 */

import { readFileSync } from 'node:fs';

interface Video {
  slug: string;
  exerciseId: string | null;
  needsReview?: boolean;
  title?: string;
}

const read = <T,>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

const videos = read<Video[]>('src/data/workoutVideos.json');
const exercisesRaw = read<any>('src/data/jamieExercises.json');
const exercises: { id: string }[] = Array.isArray(exercisesRaw)
  ? exercisesRaw
  : exercisesRaw.exercises ?? Object.values(exercisesRaw);
const serverManifest = read<{ slug: string; objectKey?: string; streamUid?: string }[]>(
  'supabase/functions/get-workout-video/manifest.json',
);

const svc = readFileSync('src/services/videoService.ts', 'utf8');
const mapStart = svc.indexOf('EXERCISE_VIDEO_SLUG_MAP');
const mapBlock = svc.slice(mapStart, svc.indexOf('};', mapStart));
const slugMap = new Map<string, string>(
  [...mapBlock.matchAll(/^\s*'([^']+)':\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]),
);

const exerciseIds = new Set(exercises.map((e) => e.id));
const serverSlugs = new Set(serverManifest.filter((v) => v.objectKey || v.streamUid).map((v) => v.slug));
const reviewed = videos.filter((v) => !v.needsReview && v.exerciseId);

let errors = 0;
const fail = (m: string) => {
  errors++;
  console.error(`  ❌ ${m}`);
};
const ok = (m: string) => console.log(`  ✅ ${m}`);
const warn = (m: string) => console.log(`  ⚠️  ${m}`);

console.log('\n━━━ Workout video integrity ━━━');
console.log(
  `  ℹ️  ${videos.length} clips (${reviewed.length} reviewed) · ${exercises.length} exercises · ` +
    `${slugMap.size} mapped · ${serverSlugs.size} signable server-side`,
);

// 1. HARD FAILURE — a mapped slug the server will not sign is a play button
//    that errors for a real user.
const unsignable = [...slugMap.entries()].filter(([, slug]) => !serverSlugs.has(slug));
for (const [exerciseId, slug] of unsignable) {
  fail(`${exerciseId} -> "${slug}" is not in the server allowlist — the play button will error`);
}
if (unsignable.length === 0) ok('every mapped slug can be signed by get-workout-video');

// 2. HARD FAILURE — a reviewed clip whose slug the server cannot sign.
const reviewedUnsignable = reviewed.filter((v) => !serverSlugs.has(v.slug));
for (const v of reviewedUnsignable) {
  fail(`reviewed clip "${v.slug}" is missing from the server allowlist`);
}

// 3. Referential drift. Real content debt, but not a crash: the app simply
//    never surfaces these. Reported loudly, does not fail the build, because
//    fixing it means re-tagging clips by hand and a red pipeline gets ignored.
const strandedVideos = [...new Set(reviewed.filter((v) => !exerciseIds.has(v.exerciseId!)).map((v) => v.exerciseId!))];
const deadMapEntries = [...slugMap.keys()].filter((id) => !exerciseIds.has(id));

if (strandedVideos.length) {
  warn(
    `${strandedVideos.length} exerciseId(s) are tagged on reviewed clips but no such exercise exists — ` +
      `those clips can never appear: ${strandedVideos.slice(0, 6).join(', ')}${strandedVideos.length > 6 ? ' …' : ''}`,
  );
}
if (deadMapEntries.length) {
  warn(
    `${deadMapEntries.length} map entr(ies) point at a non-existent exercise — dead lookups: ` +
      `${deadMapEntries.slice(0, 6).join(', ')}${deadMapEntries.length > 6 ? ' …' : ''}`,
  );
}

// 4. Coverage — reviewed clips whose exercise is real but which the map omits,
//    so the exercise detail shows no video even though one exists.
const missingFromMap = [
  ...new Set(
    reviewed
      .filter((v) => exerciseIds.has(v.exerciseId!) && !slugMap.has(v.exerciseId!))
      .map((v) => v.exerciseId!),
  ),
];
if (missingFromMap.length) {
  warn(
    `${missingFromMap.length} exercise(s) have a reviewed clip but no map entry — run ` +
      `scripts/regen-video-service-maps.mjs: ${missingFromMap.slice(0, 6).join(', ')}`,
  );
} else {
  ok('every reviewed clip on a real exercise is reachable from the map');
}

console.log('');
if (errors > 0) {
  console.error(`  ${errors} blocking problem(s)\n`);
  process.exit(1);
}
process.exit(0);
