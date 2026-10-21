#!/usr/bin/env node
/**
 * Reachability, counting only navigation a user can actually cause.
 *
 * WHY THIS EXISTS ALONGSIDE verify:routes
 * `verify-route-reachability.ts` builds its "linked" set from EVERY `'/...'`
 * string literal in every file under app/ and src/. A route mentioned in a
 * lookup table, a telemetry tag, a comment-adjacent string or a dead component
 * counts as a link. Its own header records what that cost:
 *
 *   App Review rejected build 1.9.8 under 2.3 because the reviewer could not
 *   find the dose calculator named in our own App Store description.
 *   `/calculators` had no inbound link from any screen at all, and the scanner
 *   called it reachable because Aimee's route allowlist contained the string.
 *
 * That is still true today. `/calculators` is referenced in exactly two places:
 * a comment in src/lib/navMap.ts describing the rejection, and
 * ROUTE_DESCRIPTIONS in src/services/llmService.ts — Aimee's nav-action
 * descriptors. Aimee requires PepTalk+ or Pro. For a free user, and for a
 * reviewer who does not subscribe, those screens do not exist.
 *
 * WHAT COUNTS AS A DOOR HERE
 * A route-shaped literal in a position that MOVES someone: a `router.push` /
 * `replace` / `navigate`, a `<Link>` or `<Redirect>` href, an `href:` or
 * `pathname:` in a nav entry, or a route literal passed as the first argument
 * to any call — which is how `goPrimary('/workouts/generate')` reads, and
 * missing that form is what made the first draft of this script report eleven
 * false positives.
 *
 * AND ONLY FROM A REACHABLE FILE
 * The walk starts at the root layout and the three destinations routeGuard can
 * send a visitor to, then follows imports and nav edges. A link on a screen
 * nobody can open is not a door. `/calculators/reconstitution` is linked only
 * from `/calculators`, which is itself unreachable.
 *
 * This does NOT replace verify:routes — that check also validates the nav sheet
 * resolves and that every section has an entry. The two disagree on purpose.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const MUTATE = process.argv.includes('--self-test');
const slash = (p) => p.split(path.sep).join('/');
const PARAM = (t) => t.replace(/\[[^\]]+\]/g, '[x]');

/**
 * Built screens with no door, and the reason each is left that way.
 *
 * These are product calls, not bugs to be silently wired: each duplicates a
 * screen that IS reachable, and shipping both would put two of the same tool in
 * the menu. Same treatment verify:routes gives nutrition/food-scanner.
 */
const ALLOWED = new Map([
  [
    'calculators',
    'hub whose only job is linking to quick-dose and reconstitution, both of ' +
      'which the nav sheet already covers directly. Delete or wire — Edward’s call.',
  ],
  [
    'calculators/reconstitution',
    'overlaps /doses/calculator, whose own hint is "Reconstitute, draw, doses ' +
      'per vial". Which one survives is a product call.',
  ],
  [
    'nutrition/food-scanner',
    'DUPLICATE of nutrition/meal-scan — both photograph a meal and call the ' +
      'same food-scan edge function. Already on the verify:routes backlog.',
  ],
]);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== 'node_modules' && e !== '__tests__') walk(p, out);
    } else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(slash(p));
  }
  return out;
}

const files = [...walk('app'), ...walk('src')];
const baseSrc = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

const NAV_RES = [
  /router\s*\.\s*(?:push|replace|navigate)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /router\s*\.\s*(?:push|replace|navigate)\s*\(\s*\{\s*pathname\s*:\s*['"`]([^'"`]+)['"`]/g,
  /<Link\b[\s\S]{0,200}?href\s*=\s*\{?\s*['"`]([^'"`]+)['"`]/g,
  /<Redirect\b[\s\S]{0,200}?href\s*=\s*\{?\s*['"`]([^'"`]+)['"`]/g,
  /\bhref\s*:\s*['"`]([^'"`]+)['"`]/g,
  /\bpathname\s*:\s*['"`]([^'"`]+)['"`]/g,
  /\b[A-Za-z_$][\w$]*\s*\(\s*['"`](\/[^'"`\n]+)['"`]/g,
];

const normRoute = (t) =>
  PARAM(t.replace(/\$\{[^}]*\}/g, '[x]'))
    .replace(/\?.*$/, '')
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .replace('(tabs)/', '');

function analyse(src) {
  const routeFile = new Map();
  for (const f of [...src.keys()].filter((x) => x.startsWith('app/') && x.endsWith('.tsx'))) {
    const base = f.replace(/^app\//, '').replace(/\.tsx$/, '');
    if (/(^|\/)_layout$/.test(base) || base.startsWith('+')) continue;
    const n = base.replace('(tabs)/', '').replace(/\/index$/, '');
    routeFile.set(PARAM(n === 'index' ? '' : n), f);
  }

  const navTargets = (text) => {
    const out = new Set();
    for (const re of NAV_RES) for (const m of text.matchAll(re)) out.add(normRoute(m[1]));
    return out;
  };

  const importTargets = (file, text) => {
    const out = new Set();
    for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const base = slash(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
      for (const c of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
        if (src.has(c)) {
          out.add(c);
          break;
        }
      }
    }
    return out;
  };

  const roots = ['app/_layout.tsx', 'app/(tabs)/_layout.tsx'];
  for (const r of ['onboarding', 'auth', 'set-password', '']) {
    const f = routeFile.get(r);
    if (f) roots.push(f);
  }

  const seen = new Set();
  const queue = roots.filter((f) => src.has(f));
  const reached = new Set();
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const text = src.get(f) ?? '';
    for (const t of importTargets(f, text)) if (!seen.has(t)) queue.push(t);
    for (const t of navTargets(text)) {
      reached.add(t);
      const tf = routeFile.get(t);
      if (tf && !seen.has(tf)) queue.push(tf);
    }
  }

  const orphans = [...routeFile.entries()].filter(([r]) => r !== '' && !reached.has(r));
  return { routeFile, seen, reached, orphans };
}

// ── self-test ─────────────────────────────────────────────────────────────
// A reachability check that cannot detect an unreachable route is decoration.
// Each case corrupts the corpus in memory and asserts the result changes.
if (MUTATE) {
  const base = analyse(baseSrc);
  let bad = 0;
  const check = (name, ok) => {
    console.log(`  ${ok ? '✓' : '✗ MISSED'}  ${name}`);
    if (!ok) bad++;
  };

  // 1. a brand-new screen nothing links to must be reported.
  {
    const s = new Map(baseSrc);
    s.set('app/ghost/index.tsx', 'export default function Ghost() { return null; }');
    const r = analyse(s);
    check('an unlinked new screen is reported', r.orphans.some(([x]) => x === 'ghost'));
  }

  // 2. THE BLIND SPOT. A route named only in a descriptor map — the exact shape
  //    of Aimee's ROUTE_DESCRIPTIONS — must NOT count as a door.
  {
    const s = new Map(baseSrc);
    s.set('app/ghost/index.tsx', 'export default function Ghost() { return null; }');
    s.set(
      'src/services/ghostDescriptors.ts',
      "export const D = { '/ghost': { label: 'Ghost', icon: 'x' } };",
    );
    const r = analyse(s);
    check(
      'a route named only in a lookup table is still reported',
      r.orphans.some(([x]) => x === 'ghost'),
    );
  }

  // 3. …but a real door from a reachable screen must clear it.
  {
    const s = new Map(baseSrc);
    s.set('app/ghost/index.tsx', 'export default function Ghost() { return null; }');
    s.set('app/_layout.tsx', `${baseSrc.get('app/_layout.tsx')}\n// router.push('/ghost')\n`);
    const r = analyse(s);
    check('a genuine router.push clears it', !r.orphans.some(([x]) => x === 'ghost'));
  }

  // 4. a door on an UNREACHABLE screen must not clear it.
  {
    const s = new Map(baseSrc);
    s.set('app/ghost/index.tsx', 'export default function Ghost() { return null; }');
    s.set('app/ghost2/index.tsx', "export default function G2() { router.push('/ghost'); }");
    const r = analyse(s);
    check(
      'a door on an unreachable screen does not count',
      r.orphans.some(([x]) => x === 'ghost'),
    );
  }

  // 5. removing the nav-sheet entry for Plan a cycle must strand it again.
  {
    const s = new Map(baseSrc);
    s.set('src/lib/navMap.ts', baseSrc.get('src/lib/navMap.ts').replace("href: '/calculators/plan',", "href: '/x-removed',"));
    const r = analyse(s);
    check('removing its nav entry strands calculators/plan', r.orphans.some(([x]) => x === 'calculators/plan'));
  }

  check('the real corpus is not itself broken', base.routeFile.size >= 40);
  console.log(bad ? `\n✗ ${bad} self-test failure(s)` : '\n✓ self-test: every case detected');
  process.exit(bad ? 1 : 0);
}

// ── run ───────────────────────────────────────────────────────────────────
const { routeFile, seen, reached, orphans } = analyse(baseSrc);

// Positive control. An empty app/ or the wrong working directory would report
// zero routes and zero orphans, which reads as success. Two sibling scanners
// were caught doing exactly that on 2026-08-10.
const MIN_ROUTES = 40;
if (routeFile.size < MIN_ROUTES) {
  console.error(`\n✗ SELF-CHECK FAILED — only ${routeFile.size} routes discovered (expected >= ${MIN_ROUTES}).`);
  process.exit(1);
}

console.log('— True reachability: doors a user can actually open —');
console.log(`  ${routeFile.size} routes · ${seen.size} files reached · ${reached.size} distinct nav targets`);

for (const [route, reason] of ALLOWED) {
  if (!routeFile.has(route)) {
    console.error(`  ❌ allowlisted route "${route}" no longer exists — remove it (${reason})`);
    process.exit(1);
  }
}

const unexpected = orphans.filter(([r]) => !ALLOWED.has(r));
const known = orphans.filter(([r]) => ALLOWED.has(r));

if (known.length) {
  console.log(`\n  ${known.length} known door-less screen(s), each a product call:`);
  for (const [r] of known) console.log(`     ${r} — ${ALLOWED.get(r)}`);
}

if (!unexpected.length) {
  console.log('\n  ✓ every other screen has a door reachable from the root layout');
  process.exit(0);
}

console.error(`\n  ✗ ${unexpected.length} screen(s) with NO door:`);
for (const [r, f] of unexpected) console.error(`     ${r.padEnd(32)} ${f}`);
console.error('\n  Link them from the UI, or add them to ALLOWED with a reason.');
console.error('  A mention in a descriptor map or an allowlist is not a door.\n');
process.exit(1);
