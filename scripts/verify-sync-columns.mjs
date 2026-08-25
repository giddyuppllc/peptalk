/**
 * verify:synccolumns — every key we sync must be a real column.
 *
 * PostgREST rejects the WHOLE row when one key is not a column. There is no
 * partial write and, because every syncRecord call is fire-and-forget, no
 * error reaches the user. The record simply stays local and is lost on
 * reinstall.
 *
 * This has already happened twice in this repo:
 *   - dose_logs: an earlier version wrote `dose_mcg` instead of `amount`, and
 *     every dose stayed local-only with no error anywhere.
 *   - check_ins: `respiratory_rate` / `body_measurements` were captured by the
 *     store and had no columns, so EVERY check-in sync failed until migration
 *     20260629000000 added them.
 *
 * Both were found by accident, months later. This finds them in CI.
 *
 * The column truth is a snapshot committed alongside the migrations
 * (scripts/sync-columns.json), refreshed with:
 *   npm run verify:synccolumns -- --refresh      (requires a linked project)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'scripts', 'sync-columns.json');
const SRC_DIRS = [path.join(ROOT, 'src'), path.join(ROOT, 'app')];

// ── refresh mode: pull the live schema ───────────────────────────────────
if (process.argv.includes('--refresh')) {
  const sql = `
    select table_name, column_name from information_schema.columns
    where table_schema='public' order by table_name, column_name;
  `;
  const tmp = path.join(ROOT, '.sync-cols.sql');
  fs.writeFileSync(tmp, sql);
  try {
    const raw = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', tmp], {
      encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const rows = JSON.parse(raw.slice(raw.indexOf('{'))).rows ?? [];
    const out = {};
    for (const r of rows) (out[r.table_name] ??= []).push(r.column_name);
    fs.writeFileSync(SNAPSHOT, JSON.stringify(out, null, 2) + '\n');
    console.log(`refreshed: ${Object.keys(out).length} tables`);
  } finally {
    fs.unlinkSync(tmp);
  }
  process.exit(0);
}

if (!fs.existsSync(SNAPSHOT)) {
  console.error('SELF-CHECK FAILED: no column snapshot. Run with --refresh against a linked project.');
  process.exit(1);
}
const COLUMNS = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));

// ── find every syncRecord('table', { ... }) call ─────────────────────────
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
    if (/\.tsx?$/.test(e.name)) files.push(p);
  }
};
SRC_DIRS.forEach(walk);

const calls = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  // syncRecord('table', {  ...keys... })  — brace-matched so nested objects
  // and template literals inside values do not truncate the payload.
  const re = /syncRecord\(\s*'([a-z_]+)'\s*,\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const table = m[1];
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    const body = src.slice(re.lastIndex, i - 1);
    // Strip string and template literals FIRST. Without this, an ISO
    // timestamp inside a value (`${r.date}T00:00:00.000Z`) matches the key
    // pattern as "T00" and gets reported as a phantom missing column.
    let flat = body
      .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '`S`')
      .replace(/'(?:\\.|[^'\\])*'/g, "'S'")
      .replace(/"(?:\\.|[^"\\])*"/g, '"S"')
      .replace(/\/\/[^\n]*/g, '');
    // Top-level keys only: collapse nested objects before matching.
    for (let pass = 0; pass < 6; pass++) flat = flat.replace(/\{[^{}]*\}/g, 'X');
    const keys = [...flat.matchAll(/(^|[,{\s])([a-z_][a-z0-9_]*)\s*:/gi)].map((k) => k[2]);
    calls.push({ file: path.relative(ROOT, file), table, keys: [...new Set(keys)] });
  }
}

if (calls.length < 5) {
  console.error(`SELF-CHECK FAILED: found only ${calls.length} syncRecord calls — the matcher is broken, not the code.`);
  process.exit(1);
}

console.log('— sync payload keys vs real columns —');
console.log(`  syncRecord call sites: ${calls.length}`);
console.log(`  tables in snapshot   : ${Object.keys(COLUMNS).length}`);

let failed = false;
for (const c of calls) {
  const cols = COLUMNS[c.table];
  if (!cols) {
    failed = true;
    console.log(`\n  🔴 ${c.file}\n     syncs to "${c.table}" — NO SUCH TABLE`);
    continue;
  }
  // user_id is attached by syncRecord itself.
  const unknown = c.keys.filter((k) => k !== 'user_id' && !cols.includes(k));
  if (unknown.length) {
    failed = true;
    console.log(`\n  🔴 ${c.file}\n     ${c.table} has no column: ${unknown.join(', ')}`);
    console.log('     PostgREST rejects the WHOLE row — this record never syncs.');
  }
}

if (failed) {
  console.log('\n  Add the column in a migration, or stop sending the key.');
  process.exit(1);
}
console.log('\n  ✓ every synced key exists as a column.');
