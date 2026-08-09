/**
 * verify:navparams — a route parameter that is sent but never read.
 *
 * Another silent contract between two files. One screen navigates with
 * `params: { peptideId, intensity }`, the destination reads `peptideId` and has
 * no idea `intensity` exists, and nothing anywhere complains. The user makes a
 * choice, the choice is discarded, and the screen looks like it is working.
 *
 * Found on the peptide detail screen, whose Beginner/Advanced card says in its
 * own comment "tap a pill to open the calculator pre-pointed at that
 * intensity". It sent `intensity`; app/doses/calculator.tsx contained zero
 * references to it. Both pills produced identical numbers.
 *
 * The check pairs every navigation that carries params with the destination
 * screen's `useLocalSearchParams` type, and reports keys the destination never
 * mentions. Both object form (`params: { a, b }`) and query form (`?a=1&b=2`)
 * are collected.
 *
 * Deliberately narrow: it only reports a param when it can resolve the
 * destination to a real screen file, so a dynamic pathname is skipped rather
 * than guessed at. Missing a case is fine; a false alarm that trains people to
 * ignore the output is not.
 */
import { readFileSync, existsSync } from 'fs';
import { globSync } from 'glob';

const slash = (s) => s.split(String.fromCharCode(92)).join('/');
const files = globSync('{app,src}/**/*.tsx').map(slash);

/** '/doses/calculator' → the file that implements it, or null. */
function routeFile(route) {
  const clean = route.replace(/^\//, '').replace(/\/$/, '');
  const candidates = [
    `app/${clean}.tsx`,
    `app/${clean}/index.tsx`,
    // (group) segments are invisible in the URL, so try inserting each group
    ...globSync('app/*/').map((g) => `${slash(g)}${clean}.tsx`),
    ...globSync('app/*/').map((g) => `${slash(g)}${clean}/index.tsx`),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

/** Remove block and line comments so a mention in prose is not mistaken for use. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

/**
 * Narrow the destination to the places a route parameter can actually be read
 * from, and search only there:
 *
 *   const { a, b } = useLocalSearchParams<{ a?: string; b?: string }>()
 *   params.a
 *   searchParams.a
 *
 * Searching the whole file was too loose to be worth having. The fix for
 * `intensity` introduced a helper `intentFromIntensity(intensity: string)`, and
 * that unrelated PARAMETER made the destination look like it read the route
 * param — so a deliberately re-broken build still passed. A check that reports
 * green on the exact bug it was written for is worse than no check.
 */
function readsParams(src) {
  const parts = [];
  const declRe = /useLocalSearchParams\s*(<[^>]*>)?\s*\(\s*\)/g;
  let m;
  while ((m = declRe.exec(src))) {
    if (m[1]) parts.push(m[1]); // the generic type argument
    // the destructure immediately to the left: `const { a, b } = `
    const before = src.slice(Math.max(0, m.index - 300), m.index);
    const destructure = before.match(/\{([^{}]*)\}\s*=\s*$/);
    if (destructure) parts.push(destructure[1]);
  }
  for (const ref of src.matchAll(/\b(?:params|searchParams)\.([A-Za-z_$][\w$]*)/g)) {
    parts.push(ref[1]);
  }
  return parts.join('\n');
}

const findings = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');

  // ── object form: pathname: '/x', params: { a, b: c }
  const objRe = /pathname:\s*['"`]([^'"`]+)['"`][\s\S]{0,200}?params:\s*\{([^}]*)\}/g;
  let m;
  while ((m = objRe.exec(src))) {
    const keys = m[2]
      .split(',')
      .map((s) => s.split(':')[0].trim())
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
    findings.push({ file, route: m[1], keys, line: src.slice(0, m.index).split('\n').length });
  }

  // ── query form: router.push(`/x?a=${v}&b=1`)
  const qRe = /router\.(?:push|replace|navigate)\s*\(\s*[`'"]([^`'"?]+)\?([^`'"]+)[`'"]/g;
  while ((m = qRe.exec(src))) {
    const keys = m[2]
      .split('&')
      .map((kv) => kv.split('=')[0].trim())
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
    findings.push({ file, route: m[1], keys, line: src.slice(0, m.index).split('\n').length });
  }
}

/**
 * Params that are sent, unread, and NOT a wiring mistake — the destination
 * feature does not exist yet. Recorded with the reason so the gap stays
 * visible, rather than deleted (which hides the intent) or implemented
 * (which would be inventing product behaviour).
 */
const ALLOWED = new Map([
  [
    '/nutrition/recipe-generator::asTemplate',
    'The "Create meal" button on food-search\'s My Meals tab sends asTemplate=1, ' +
      'meaning "build a reusable meal template rather than log one meal". ' +
      'recipe-generator is an AI recipe tool with no template concept at all — ' +
      'it generates a recipe and offers "Log meal". The flag expresses a feature ' +
      'that was never built. Needs a product decision, not a code fix.',
  ],
]);

const problems = [];
for (const f of findings) {
  if (f.route.includes('${')) continue; // dynamic destination — do not guess
  const dest = routeFile(f.route);
  if (!dest) continue; // cannot resolve; verify:routes covers missing screens
  const destSrc = readsParams(stripComments(readFileSync(dest, 'utf8')));
  for (const key of f.keys) {
    // A destination "reads" a key if it names it in CODE — the
    // useLocalSearchParams type, a destructure, or params.key.
    //
    // Comments are stripped first, and that matters: the fix for `intensity`
    // includes a long comment explaining the bug, and while it was there a
    // re-broken build still passed this check. A note about a parameter is not
    // the same as using it, and a verifier that cannot tell the difference is
    // worse than none — it certifies exactly the state it exists to catch.
    if (new RegExp(`\\b${key}\\b`).test(destSrc)) continue;
    if (ALLOWED.has(`${f.route}::${key}`)) continue;
    problems.push({ ...f, key, dest });
  }
}

/**
 * ── The mirror: a param a screen READS that nobody sends ─────────────────────
 *
 * The same broken contract from the other end. The screen supports something —
 * "open scrolled to this item", "add to this existing meal" — and no door into
 * it was ever built, so the branch is dead code that reads like a feature.
 *
 * Found: the paywall. app/subscription.tsx reads `highlight`, maps it to a tier
 * and glows that plan, AND feeds it to trackPaywallViewed. PaywallModal knew
 * exactly which feature was gated — it passes it to trackPaywallDismissed — and
 * pushed '/subscription' without it. So no tier was ever highlighted, and every
 * paywall view was logged as 'direct'/'plus' no matter what triggered it.
 *
 * Route SEGMENTS ([username], [eventId]) are excluded — expo-router supplies
 * those from the path, not from a params object.
 */
const READ_ALLOWED = new Map([
  [
    'app/doses/calculator.tsx::doseMcg',
    'Sent by Aimee SERVER-SIDE — execOpenDosingCalculator in ' +
      'supabase/functions/aimee-chat-stream/_tools.ts builds ' +
      '/doses/calculator?peptideId=..&doseMcg=..&vialMg=..&waterMl=.. and ships ' +
      'it as a navigate client_action. No client file sends it, and that is ' +
      'correct. Same for vialMg and waterMl.',
  ],
  [
    'app/doses/calculator.tsx::vialMg',
    'See doseMcg — sent by the aimee-chat-stream edge function.',
  ],
  [
    'app/doses/calculator.tsx::waterMl',
    'See doseMcg — sent by the aimee-chat-stream edge function.',
  ],
  [
    'app/workouts/my-workouts.tsx::highlight',
    'Expands a saved workout on arrival. Nothing sends it — after saving, ' +
      'workouts/new returns to /workouts instead. Degrades to null (nothing ' +
      'expanded), so the screen is correct without it. Wiring it up is a UX ' +
      'choice, not a fix.',
  ],
  [
    'app/nutrition/food-search.tsx::mealId',
    'Documented as "if provided, adds to an existing meal entry" and fully ' +
      'implemented — it updates the existing meal rather than adding a new ' +
      'one. But no screen renders logged meals as a tappable list, so there is ' +
      'no door into it anywhere in the app. The add-to-existing-meal FEATURE ' +
      'was never built; this param is all that remains of the intent.',
  ],
]);

const unsent = [];
{
  const appScreens = files.filter((f) => f.startsWith('app/'));
  // Senders live in .ts too — useAimeeRouter builds `?message=...` in a hook,
  // not a screen. Scanning only .tsx reported `message` as unsent, which is
  // the checker being wrong rather than the app.
  const senderFiles = globSync('{app,src}/**/*.{ts,tsx}').map(slash);
  const sentKeys = new Set();
  for (const f of senderFiles) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/params:\s*\{([^}]*)\}/g)) {
      for (const kv of m[1].split(',')) {
        const k = kv.split(':')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(k)) sentKeys.add(k);
      }
    }
    for (const m of src.matchAll(/[?&]([A-Za-z_$][\w$]*)=/g)) sentKeys.add(m[1]);
  }
  for (const f of appScreens) {
    // expo-router fills dynamic segments from the path itself.
    const segments = [...f.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
    const src = stripComments(readFileSync(f, 'utf8'));
    const keys = new Set();
    for (const m of src.matchAll(/useLocalSearchParams\s*<\{([^}]*)\}>/g))
      for (const k of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*\??\s*:/g)) keys.add(k[1]);
    for (const k of keys) {
      if (segments.includes(k)) continue;
      if (sentKeys.has(k)) continue;
      if (READ_ALLOWED.has(`${f}::${k}`)) continue;
      unsent.push({ file: f, key: k });
    }
  }
}

console.log('\n— Navigation parameter contracts —');
console.log(`  ${findings.length} navigation(s) carrying params, across ${files.length} screens`);
if (ALLOWED.size) {
  console.log(`  ℹ️  ${ALLOWED.size} param(s) knowingly unread:`);
  for (const [k, why] of ALLOWED) console.log(`     ${k} — ${why}`);
}

if (READ_ALLOWED.size) {
  console.log(`  ℹ️  ${READ_ALLOWED.size} param(s) read with no door built:`);
  for (const [k, why] of READ_ALLOWED) console.log(`     ${k} — ${why}`);
}

if (problems.length === 0 && unsent.length === 0) {
  console.log('\n✓ Every parameter sent is read by its destination.');
  console.log('✓ Every parameter read is sent by someone.\n');
  process.exit(0);
}

console.log('');
for (const u of unsent) {
  console.log(`  ❌ ${u.file} reads '${u.key}' but nothing sends it`);
  console.log(`     A supported behaviour with no way to reach it. Wire a sender,`);
  console.log(`     or record it in READ_ALLOWED with the reason.\n`);
}
for (const p of problems) {
  console.log(`  ❌ ${p.file}:${p.line} sends '${p.key}' to ${p.route}`);
  console.log(`     ${p.dest} never mentions it — the value is silently dropped.\n`);
}
console.log(`  ${problems.length} unread navigation parameter(s)\n`);
process.exit(1);
