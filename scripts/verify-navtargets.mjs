/**
 * verify:navtargets — every literal navigation target must be a real screen.
 *
 * WHY THIS EXISTS
 * `verify:routes` checks the REVERSE direction — is every screen reachable
 * from somewhere. That misses the failure that actually reaches users: a
 * button that pushes a path which does not exist. Expo Router does not throw
 * for an unknown path; it renders the +not-found screen, so the button "works"
 * in the sense that something happens, and only a human tapping it notices.
 *
 * Four Aimee buttons dead-ended that way, and the reverse-direction check was
 * green the whole time.
 *
 * Only literal string targets are checked. A computed path (`/peptide/${id}`)
 * cannot be resolved statically and is skipped rather than guessed at — the
 * dynamic route it lands on is covered by the `[param].tsx` matcher below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');

// ── the real routes, from the file tree ──────────────────────────────────
const routes = new Set();
const dynamic = [];

function walkApp(dir, prefix = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkApp(p, `${prefix}/${e.name}`);
      continue;
    }
    if (!/\.tsx?$/.test(e.name)) continue;
    if (e.name.startsWith('_')) continue; // _layout etc.
    const base = e.name.replace(/\.tsx?$/, '');
    // index.tsx maps to the EMPTY segment — `/(tabs)/index` is not a route,
    // `/(tabs)` is. Getting this backwards is what made four buttons dead-end.
    const route = base === 'index' ? prefix || '/' : `${prefix}/${base}`;
    routes.add(route);
    if (/\[.+\]/.test(route)) {
      const rx = route
        .replace(/\[\.\.\..+?\]/g, '.+')
        .replace(/\[.+?\]/g, '[^/]+');
      dynamic.push(new RegExp(`^${rx}$`));
    }
  }
}
walkApp(APP);

// Group folders — (tabs) — are transparent in the URL, so index both forms.
const stripGroups = (r) => r.replace(/\/\([^)]+\)/g, '');
const flat = new Set([...routes].map(stripGroups));

// ── every literal navigation target ──────────────────────────────────────
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(p);
      continue;
    }
    if (/\.tsx?$/.test(e.name)) files.push(p);
  }
}
walk(path.join(ROOT, 'app'));
walk(path.join(ROOT, 'src'));

const targets = new Map();
for (const f of files) {
  if (f.includes('__tests__')) continue;
  const src = fs.readFileSync(f, 'utf8');
  const re = /router\.(?:push|replace|navigate)\(\s*['"`]([^'"`$]+)['"`]/g;
  let m;
  while ((m = re.exec(src))) {
    const raw = m[1].split('?')[0].replace(/\/+$/, '') || '/';
    if (!raw.startsWith('/')) continue;
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (!targets.has(raw)) targets.set(raw, new Set());
    targets.get(raw).add(rel);
  }
}

console.log('— navigation targets vs real routes —');
console.log(`  route files          : ${routes.size}`);
console.log(`  literal nav targets  : ${targets.size}`);

// Self-check: a matcher that finds nothing would pass silently.
if (targets.size < 10) {
  console.error(
    `\nSELF-CHECK FAILED: only ${targets.size} navigation targets found — ` +
      'the matcher is broken, not the code.',
  );
  process.exit(1);
}

const resolves = (t) => {
  if (routes.has(t) || flat.has(t)) return true;
  if (routes.has(`${t}/index`) || flat.has(`${t}/index`)) return true;
  return dynamic.some((rx) => rx.test(t) || rx.test(`/(tabs)${t}`));
};

const broken = [...targets.entries()].filter(([t]) => !resolves(t));

if (broken.length) {
  console.log('');
  for (const [t, from] of broken) {
    console.log(`  🔴 ${t}`);
    console.log(`     pushed from: ${[...from].join(', ')}`);
  }
  console.log(
    '\n  Expo Router does not throw for an unknown path — it renders +not-found,',
  );
  console.log('  so the button appears to work and only a user notices.\n');
  process.exit(1);
}

console.log(`\n  ✓ all ${targets.size} literal targets resolve to a real screen.\n`);
