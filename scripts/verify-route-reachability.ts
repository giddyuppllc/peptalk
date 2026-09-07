/**
 * verify:routes — find screens that exist but nothing can navigate to.
 *
 * This app's recurring failure is not broken code, it is built work that
 * nothing reaches: 24 dosing rows with no library entry, `square-subscribe`
 * deployed nowhere, `getAllDosingReferencesForPeptide` with zero callers, a
 * service worker that never cached anything. Screens fail the same way — a
 * route registered in `_layout.tsx` renders fine if you type the URL, and is
 * invisible to every user, because registering a route is not the same as
 * linking to it.
 *
 * A route counts as reachable if any source file mentions its path in a string
 * or template literal (`router.push('/x')`, `href="/x"`, `` `/peptide/${id}` ``),
 * or if it is a tab, which the tab bar renders directly. Dynamic segments are
 * normalised, so `/peptide/${id}` matches `peptide/[id]`.
 *
 * Deliberately unlinked routes go in ALLOWED below with a reason. That keeps
 * the check at zero noise, so a new entry in the report means someone shipped a
 * screen nobody can open.
 *
 * KNOWN LIMITATION — this counts any path-shaped string as a link, and some are
 * comparisons rather than navigation. HomeFab and GlobalAimeeFab hold arrays of
 * "surfaces where the FAB hides" containing entries like '/workouts/player';
 * that made the superseded workouts/player look reachable when nothing actually
 * navigates to it. The check therefore under-reports. Distinguishing a
 * comparison from a navigation needs real call-graph analysis, so treat a clean
 * run as "no obvious orphans" rather than proof every screen has a door.
 */

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const slash = (s: string) => s.split('\\').join('/');
const norm = (r: string) => slash(r).replace(/\[[^\]]*\]/g, '[x]');

/** Routes that are intentionally not linked from the UI. */
const ALLOWED = new Map<string, string>([
  ['settings/healthkit-debug', 'dev-only diagnostic; redirects out when !__DEV__'],
  ['workouts/library', 'redirects to workouts/exercises'],
  ['workouts/library/[x]', 'child of the redirecting library route'],
  ['admin/video-tagger', 'admin-only, opened deliberately by URL'],
  ['admin/community-queue', 'admin-only, opened deliberately by URL'],
  ['admin/start-live', 'admin-only, opened deliberately by URL'],
  [
    'community/leaderboard',
    'Phase 2 — LeaderboardStrip still uses mock data; milestones.tsx says server fan-out "rolls out with the leaderboard". Deliberately unlaunched, not orphaned.',
  ],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const routes = new Set<string>();
const tabRoutes = new Set<string>();
for (const f of walk('app').filter((f) => f.endsWith('.tsx'))) {
  const base = slash(f).replace(/^app\//, '').replace(/\.tsx$/, '');
  if (/(^|\/)_layout$/.test(base) || base.startsWith('+')) continue;
  const isTab = base.startsWith('(tabs)/');
  const n = norm(base.replace('(tabs)/', '').replace(/\/index$/, ''));
  routes.add(n);
  if (isTab) tabRoutes.add(n);
}

/**
 * Positive control.
 *
 * `walk('app')` throws if app/ is missing, but an app/ that is merely EMPTY —
 * or a run from the wrong working directory — yields zero routes, zero
 * unreachable screens, and "✅ no NEW unreachable screens". A reachability
 * check with no routes proves nothing.
 *
 * Two sibling scanners were caught doing exactly this on 2026-08-10:
 * verify:deadzones and verify:navparams both printed their success lines over
 * an empty corpus.
 */
const MIN_ROUTES = 40;
if (routes.size < MIN_ROUTES) {
  console.error(
    `\n✗ SELF-CHECK FAILED — only ${routes.size} routes discovered (expected >= ${MIN_ROUTES}).` +
      '\n  Wrong working directory or an empty app/; a clean result would be meaningless.',
  );
  process.exit(1);
}

const linked = new Set<string>();
for (const f of [...walk('app'), ...walk('src')].filter((f) => /\.(ts|tsx)$/.test(f))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/['"`](\/[^'"`\n]*)['"`]/g)) {
    const t = m[1]
      .replace(/\$\{[^}]*\}/g, '[x]')
      .replace(/\?.*$/, '')
      .replace(/^\//, '')
      .replace(/\/$/, '');
    if (t) linked.add(norm(t));
  }
}

/**
 * Screens that ARE built but nothing links to — a real backlog, not an
 * acceptable state. Kept separate from ALLOWED because the two mean opposite
 * things: ALLOWED is "correct as-is", this is "someone must give it a home".
 *
 * Listed here rather than left failing so CI stays green on settled work. A
 * permanently red pipeline gets ignored, which is how the peptide-data
 * warnings went unread for months. New orphans still fail the build.
 */
const KNOWN_ORPHANS = new Map<string, string>([
  [
    'nutrition/food-scanner',
    'DUPLICATE of nutrition/meal-scan — both photograph a meal and call the same food-scan edge function, both actively maintained. Which one survives is a product call; wiring both would ship two identical scanners.',
  ],
]);

const allUnreachable = [...routes]
  .filter((r) => r && !linked.has(r) && !tabRoutes.has(r) && !ALLOWED.has(r))
  .sort();
const unreachable = allUnreachable.filter((r) => !KNOWN_ORPHANS.has(r));
const stillOrphaned = allUnreachable.filter((r) => KNOWN_ORPHANS.has(r));

// Keep the backlog honest. A stale entry would silently excuse a future screen
// of the same name, and "reachable now" and "deleted" need different follow-ups
// — the first check could not tell them apart.
for (const [route] of KNOWN_ORPHANS) {
  if (!routes.has(route)) {
    console.log(`  ✅ "${route}" no longer exists — remove it from KNOWN_ORPHANS`);
  } else if (!allUnreachable.includes(route)) {
    console.log(`  ✅ "${route}" is now reachable — remove it from KNOWN_ORPHANS`);
  }
}

console.log('\n━━━ Route reachability ━━━');
console.log(`  ℹ️  ${routes.size} routes (${tabRoutes.size} tabs), ${linked.size} link targets, ${ALLOWED.size} allowlisted`);

// Keep the allowlist honest: an entry for a route that no longer exists is
// stale, and would silently excuse a future route of the same name.
for (const [route, reason] of ALLOWED) {
  if (!routes.has(route)) {
    console.error(`  ❌ allowlisted route "${route}" (${reason}) no longer exists — remove it`);
  }
}

if (stillOrphaned.length > 0) {
  console.log(`\n  📋 ${stillOrphaned.length} built screen(s) still waiting for a home:`);
  for (const r of stillOrphaned) {
    console.log(`     ${r} — ${KNOWN_ORPHANS.get(r)}`);
  }
}

// ── The nav sheet is the app's only visible navigation ────────────────────
// The tab bar is hidden by design, so src/lib/navMap.ts IS the menu. Two ways
// it can rot, both of which App Review has already found for us once:
//
//   1. A nav entry pointing at a route that no longer exists — a dead menu row,
//      which is worse than no row at all.
//   2. A whole section of the app with no entry — how /calculators ended up
//      unreachable by any human while this script still called it "reachable",
//      because Aimee's allowlist happened to contain the string.
//
// The second check is deliberately at SECTION level, not per screen. Requiring
// a menu row for all ~130 routes would make the menu useless; requiring that
// every top-level area has at least one door is the property that matters.
const navSrc = readFileSync('src/lib/navMap.ts', 'utf8');
const navHrefs = [...navSrc.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);

const navProblems: string[] = [];
for (const href of navHrefs) {
  const r = href.replace(/^\//, '').replace('(tabs)/', '');
  const candidates = [
    `app/${r}.tsx`,
    `app/${r}/index.tsx`,
    `app/(tabs)/${r}.tsx`,
    `app/(tabs)/${r}/index.tsx`,
  ];
  const exists = candidates.some((c) => {
    try { return statSync(c).isFile(); } catch { return false; }
  });
  if (!exists) navProblems.push(`nav entry "${href}" resolves to no route`);
}

const SECTION_EXEMPT = new Set([
  'admin',        // operator-only, reached from Profile when the flag is on
  'peptide',      // detail pages, reached from the library
  'plan', 'pantry', 'cycle', 'body-map', 'resources', 'insights',
  'privacy', 'terms', 'onboarding', 'auth', 'subscription', 'health-profile',
  'aimee',        // the Aimee tab is the surface; /aimee/* are its sub-reports
  'profile',      // app/profile/* are sub-pages opened from the Profile tab
]);
// `(tabs)` is a route group expo-router strips from URLs, so a nav entry of
// '/(tabs)/community' is the door to app/community/. Compare on the stripped
// form or every tab section looks doorless.
const navSections = new Set(
  navHrefs.map((h) => h.replace('/(tabs)/', '/').replace(/^\//, '').split('/')[0]),
);
const sections = readdirSync('app', { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('(') && !d.name.startsWith('+'))
  .map((d) => d.name)
  .filter((n) => !SECTION_EXEMPT.has(n));
for (const sec of sections) {
  if (!navSections.has(sec)) {
    navProblems.push(`app/${sec}/ has no entry in the navigation sheet`);
  }
}

if (navProblems.length > 0) {
  console.error(`\n  ${navProblems.length} navigation problem(s):`);
  for (const p of navProblems) console.error(`     ${p}`);
  console.error('\n  Fix src/lib/navMap.ts, or add the section to SECTION_EXEMPT with a reason.\n');
  process.exit(1);
}
console.log(`  ✅ all ${navHrefs.length} nav entries resolve; every section has a door`);

if (unreachable.length === 0) {
  console.log('\n  ✅ no NEW unreachable screens\n');
  process.exit(0);
}

console.error(`\n  ${unreachable.length} NEW screen(s) exist but nothing navigates to them:`);
for (const r of unreachable) {
  const file = ['app/' + r + '.tsx', 'app/' + r + '/index.tsx', 'app/(tabs)/' + r + '.tsx'].find(
    (p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    },
  );
  const lines = file ? readFileSync(file, 'utf8').split('\n').length : 0;
  console.error(`     ${r}${lines ? `  (${lines} lines)` : ''}`);
}
console.error('\n  Either link them from the UI, or add them to ALLOWED with a reason.\n');
process.exit(1);
