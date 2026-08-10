/**
 * verify:deadfiles — a module under src/ that nothing imports.
 *
 * The sibling of verify:deadcomponents, one level up: a whole file nobody
 * loads. app/ is excluded because expo-router loads screens by file path, and
 * verify:routes already covers reachability there.
 *
 * WHAT A HIT MEANS — read before deleting
 * Both files currently on the list are PARKED WORK, not rubbish, and deleting
 * either would destroy something deliberate. That is the normal case, not the
 * exception:
 *
 *   LeaderboardStrip    a Phase 2 feature on mock data. verify:routes already
 *                       records community/leaderboard as deliberately
 *                       unlaunched for the same reason.
 *   MaxYourStackCard    a coming-soon tease with a waitlist opt-in. Orphaned
 *                       when app/workouts/index.tsx was cut from 1140 lines to
 *                       238 in Jamie's simplification — dropped from the hub,
 *                       never deleted. Removing it would also strand
 *                       useFeatureWaitlistStore.
 *
 * So this check exists to keep parked work VISIBLE and deliberate rather than
 * to demand deletions. A new entry means someone orphaned a module; the fix is
 * to wire it, delete it, or record why it waits.
 */
import { readFileSync } from 'fs';
import { globSync } from 'glob';
import { basename } from 'path';

const slash = (s) => s.split(String.fromCharCode(92)).join('/');

/** Orphaned on purpose, with the reason. */
const ALLOWED = new Map([
  [
    'src/components/LeaderboardStrip.tsx',
    'Phase 2, still on mock data. Ships with the community leaderboard, which ' +
      'verify:routes also records as deliberately unlaunched.',
  ],
  [
    'src/components/MaxYourStackCard.tsx',
    'Coming-soon tease for Pro+ programming, with a waitlist opt-in. Dropped ' +
      'from the Workouts hub when that screen was simplified on Jamie\'s ' +
      'feedback (1140 lines to 238), not deleted. Deleting it would also ' +
      'strand useFeatureWaitlistStore.',
  ],
]);

const modules = globSync('src/**/*.{ts,tsx}')
  .map(slash)
  .filter((f) => !f.includes('__tests__') && !f.endsWith('.d.ts'));

const corpus = new Map(
  globSync('{app,src,scripts,supabase}/**/*.{ts,tsx,mjs}')
    .map(slash)
    .filter((f) => !f.endsWith('.d.ts'))
    .map((f) => [f, readFileSync(f, 'utf8')]),
);

/**
 * Positive control. A module 40-odd files import must register as imported; if
 * it does not, the pattern is broken and a clean run would be meaningless.
 * Several scanners in this codebase's history have failed by matching nothing
 * and reporting it as success.
 */
const CONTROL = 'src/data/peptides.ts';
const controlName = basename(CONTROL).replace(/\.tsx?$/, '');
let controlHits = 0;
for (const [file, src] of corpus) {
  if (file === CONTROL) continue;
  if (new RegExp(`from\\s+['"][^'"]*/${controlName}['"]`).test(src)) controlHits++;
}
if (controlHits < 5) {
  console.error(
    `\n✗ SELF-CHECK FAILED — ${CONTROL} appears imported by only ${controlHits} files.` +
      '\n  The import pattern is broken; a dead-file list from it would be noise.',
  );
  process.exit(1);
}

const dead = [];
for (const mod of modules) {
  if (ALLOWED.has(mod)) continue;
  const name = basename(mod).replace(/\.tsx?$/, '');
  // Platform variants (foo.web.ts) resolve from the base name.
  const base = name.replace(/\.(web|native|ios|android)$/, '');
  // `from '…'`, `require('…')` and dynamic `import('…')`. Missing the dynamic
  // form made pushTokenSync and communityNotificationDelivery — both loaded
  // that way from app/_layout — look dead.
  const re = new RegExp(`(?:from|import|require)\\s*\\(?\\s*['"][^'"]*/(?:${name}|${base})['"]`);
  let used = false;
  for (const [file, src] of corpus) {
    if (file === mod) continue;
    if (re.test(src)) {
      used = true;
      break;
    }
  }
  if (!used) dead.push(mod);
}

console.log('\n— Dead file scan —');
console.log(`  ${modules.length} modules under src/ · control ok (${controlHits} importers)`);
if (ALLOWED.size) {
  console.log(`  ℹ️  ${ALLOWED.size} orphaned on purpose:`);
  for (const [f, why] of ALLOWED) console.log(`     ${f} — ${why}`);
}

if (dead.length === 0) {
  console.log('\n✓ Every other module under src/ is imported somewhere.\n');
  process.exit(0);
}

console.log('');
for (const f of dead) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/).length;
  console.log(`  ❌ ${f} (${lines} lines) — nothing imports this`);
  console.log(`     Wire it, delete it, or add it to ALLOWED with the reason.\n`);
}
console.log(`  ${dead.length} unimported module(s)\n`);
process.exit(1);
