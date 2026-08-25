/**
 * verify:aimeescreens — the screens Aimee is TOLD she can open must be the
 * screens she CAN open.
 *
 * `navigate_to_screen` has two independent lists in _tools.ts:
 *   1. the tool DESCRIPTION, a prose list of screen names the model reads
 *   2. SCREEN_TO_PATH, the map the dispatcher actually resolves against
 *
 * Nothing tied them together. On 2026-08-24 `community-leaderboard` was
 * removed from the map (the screen had no UI entry point) and left in the
 * description — so the model would keep asking for a screen that answers
 * `{ error: 'unknown screen' }`. The user sees Aimee try to take them
 * somewhere and silently fail.
 *
 * A name in the description with no map entry is a broken promise.
 * A name in the map that the description never mentions is dead capability —
 * the model has no way to know it exists. Both are reported.
 *
 * Also verifies every mapped path resolves to a real route file under app/,
 * so a rename cannot quietly turn a working destination into a 404.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = path.join(ROOT, 'supabase', 'functions', 'aimee-chat-stream', '_tools.ts');
const APP = path.join(ROOT, 'app');

const src = fs.readFileSync(TOOLS, 'utf8');

// ── 1. names advertised in the tool description ──────────────────────────
// The description is assembled from string fragments joined with ' '. Take
// the block from 'Available screens' to the end of that array literal.
const descStart = src.indexOf('Available screens');
if (descStart === -1) {
  console.error('SELF-CHECK FAILED: could not find the description block — has _tools.ts changed shape?');
  process.exit(1);
}
const descEnd = src.indexOf('].join(', descStart);
const descBlock = src.slice(descStart, descEnd);
// Ignore commented-out lines so a deliberate exclusion note is not read as a promise.
const descLive = descBlock
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');
const advertised = new Set([...descLive.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]));

// ── 2. names the dispatcher can actually resolve ─────────────────────────
const mapStart = src.indexOf('const SCREEN_TO_PATH');
const mapEnd = src.indexOf('\n};', mapStart);
if (mapStart === -1 || mapEnd === -1) {
  console.error('SELF-CHECK FAILED: could not find SCREEN_TO_PATH.');
  process.exit(1);
}
const mapBlock = src.slice(mapStart, mapEnd);
const mapped = new Map();
for (const line of mapBlock.split('\n')) {
  if (line.trim().startsWith('//')) continue;
  const m = line.match(/^\s*'?([a-zA-Z0-9-]+)'?\s*:\s*'([^']+)'/);
  if (m) mapped.set(m[1], m[2]);
}

// Refuse to pass on an empty corpus — a scanner that reads nothing is worse
// than no scanner.
if (advertised.size < 10 || mapped.size < 10) {
  console.error(
    `SELF-CHECK FAILED: parsed ${advertised.size} advertised / ${mapped.size} mapped screens. ` +
      'Expected many more — the parser is broken, not the code.',
  );
  process.exit(1);
}

// ── 3. every mapped path must be a real route ────────────────────────────
const routes = new Set();
const walk = (dir, rel = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('+')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full, [...rel, e.name]); continue; }
    if (!/\.tsx?$/.test(e.name)) continue;
    const base = e.name.replace(/\.tsx?$/, '');
    const segs = base === 'index' ? rel : [...rel, base];
    routes.add('/' + segs.join('/'));
    routes.add('/' + segs.filter((s) => !/^\(.+\)$/.test(s)).join('/'));
  }
};
walk(APP);
const routeExists = (p) => {
  const clean = ('/' + p.split('?')[0].split('/').filter(Boolean).join('/')) || '/';
  if (routes.has(clean) || clean === '/') return true;
  const segs = clean.split('/').filter(Boolean);
  for (const r of routes) {
    const rs = r.split('/').filter(Boolean);
    if (rs.length === segs.length && rs.every((s, i) => /^\[.+\]$/.test(s) || s === segs[i])) return true;
  }
  return false;
};

// ── report ───────────────────────────────────────────────────────────────
const brokenPromises = [...advertised].filter((s) => !mapped.has(s));
const undiscoverable = [...mapped.keys()].filter((s) => !advertised.has(s));
const deadPaths = [...mapped.entries()].filter(([, p]) => !routeExists(p));

console.log('— Aimee navigate_to_screen: description vs map —');
console.log(`  advertised to the model : ${advertised.size}`);
console.log(`  resolvable by dispatcher: ${mapped.size}`);
console.log(`  route files scanned     : ${routes.size}`);

let failed = false;

if (brokenPromises.length) {
  failed = true;
  console.log(`\n  🔴 ADVERTISED BUT NOT MAPPED (${brokenPromises.length}) — the model will ask and get an error:`);
  brokenPromises.forEach((s) => console.log(`     ${s}`));
}
if (deadPaths.length) {
  failed = true;
  console.log(`\n  🔴 MAPPED TO A ROUTE THAT DOES NOT EXIST (${deadPaths.length}):`);
  deadPaths.forEach(([s, p]) => console.log(`     ${s} -> ${p}`));
}
if (undiscoverable.length) {
  console.log(`\n  ⚠️  MAPPED BUT NEVER ADVERTISED (${undiscoverable.length}) — the model cannot know these exist:`);
  undiscoverable.forEach((s) => console.log(`     ${s}`));
}

if (failed) {
  console.log('\n  Description and map must stay in lockstep.');
  process.exit(1);
}
console.log('\n  ✓ every advertised screen resolves, and every mapped path is a real route.');
