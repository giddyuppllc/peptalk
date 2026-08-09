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

console.log('\n— Navigation parameter contracts —');
console.log(`  ${findings.length} navigation(s) carrying params, across ${files.length} screens`);
if (ALLOWED.size) {
  console.log(`  ℹ️  ${ALLOWED.size} param(s) knowingly unread:`);
  for (const [k, why] of ALLOWED) console.log(`     ${k} — ${why}`);
}

if (problems.length === 0) {
  console.log('\n✓ Every parameter sent is read by its destination.\n');
  process.exit(0);
}

console.log('');
for (const p of problems) {
  console.log(`  ❌ ${p.file}:${p.line} sends '${p.key}' to ${p.route}`);
  console.log(`     ${p.dest} never mentions it — the value is silently dropped.\n`);
}
console.log(`  ${problems.length} unread navigation parameter(s)\n`);
process.exit(1);
