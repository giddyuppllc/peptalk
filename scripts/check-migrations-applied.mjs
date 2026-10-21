#!/usr/bin/env node
/**
 * check:migrations — refuse to ship an app that needs a migration the live
 * database has never had.
 *
 * Migrations and edge functions do NOT ship with the app; the store build and
 * the database move on separate tracks, and nothing in the repo ever compared
 * them. CLAUDE.md and DB_HANDOFF.md both still say "the ledger and the repo
 * agree exactly: 57 rows, 57 files" — there are 68 files now, and
 * SHIP_CHECKLIST_2026-09-15.md records the live ledger at 57. Two documents
 * asserting a number that stopped being true is exactly the failure mode
 * CLAUDE.md warns about: a doc is a lead, not an answer.
 *
 * This asks the database instead. Read-only: `supabase migration list --linked`
 * and nothing else. It never applies, repairs or pushes anything.
 *
 * IT CANNOT PASS WITHOUT AN ANSWER. If the CLI is missing, the project is not
 * linked, or the command fails for any reason, that is exit 1 with the reason —
 * not a shrug. A ship blocker that goes quiet when it cannot reach the thing it
 * blocks on is worse than not having it.
 *
 * Usage:
 *   node scripts/check-migrations-applied.mjs              against the linked project
 *   node scripts/check-migrations-applied.mjs --self-test  parser only, no network
 *
 * Not in verify:all — it needs network and Supabase auth, and verify:all must
 * run offline. It is a step on the ship checklist.
 */
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');

/** Version prefix of a migration filename: 20260915123000_name.sql → 20260915123000 */
export function versionOf(filename) {
  const m = filename.match(/^(\d{14})_/);
  return m ? m[1] : null;
}

export function localVersions(dir = MIGRATIONS) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ file: f, version: versionOf(f) }))
    .filter((r) => r.version);
}

/**
 * Parse `supabase migration list --linked`.
 *
 * The table is `Local | Remote | Time (UTC)`; either side can be blank. Both
 * the box-drawing and the ASCII renderings appear depending on CLI version and
 * terminal, so this keys off the 14-digit versions rather than the separators.
 *
 * @returns {{local: Set<string>, remote: Set<string>, rows: number}}
 */
export function parseMigrationList(stdout) {
  const local = new Set();
  const remote = new Set();
  let rows = 0;

  // JSON first. The CLI now answers with
  // {"migrations":[{"local":"2026...","remote":"2026...","time":"..."}]} and
  // this parser only understood the table, so it found zero rows and said
  // "the CLI returned no migration rows" — while printing thirteen unapplied
  // migrations directly underneath. The check was blind on the one question it
  // exists to answer, and the self-tests all passed because they exercise the
  // table parser against fixtures rather than the CLI.
  //
  // The table branch below is kept: an older CLI, or a piped/TTY difference,
  // still renders one, and losing that would trade one blind spot for another.
  const brace = stdout.indexOf('{');
  if (brace !== -1) {
    try {
      const parsed = JSON.parse(stdout.slice(brace));
      if (Array.isArray(parsed?.migrations)) {
        for (const row of parsed.migrations) {
          const l = String(row?.local ?? '').match(/\d{14}/);
          const r = String(row?.remote ?? '').match(/\d{14}/);
          if (!l && !r) continue;
          rows++;
          if (l) local.add(l[0]);
          if (r) remote.add(r[0]);
        }
        if (rows > 0) return { local, remote, rows };
      }
    } catch {
      // Not JSON, or not the shape we know. Fall through to the table.
    }
  }

  for (const raw of stdout.split(/\r?\n/)) {
    // Strip box drawing and ANSI, keep the column separators.
    const line = raw.replace(/\[[0-9;]*m/g, '').replace(/[│┃┆┊]/g, '|');
    if (!/\d{14}/.test(line)) continue;
    if (/^[\s|+-]*$/.test(line)) continue;
    const cols = line.split('|').map((c) => c.trim());
    if (cols.length < 2) continue;
    // Which rendering is this row? The boxed one has a separator at BOTH ends,
    // so it splits into (columns + 2) cells with the first and last empty. The
    // ASCII one has neither. Deciding on "first cell is empty" alone reads a
    // remote-only ASCII row — whose Local cell is blank — as a LOCAL row, which
    // made a never-applied migration look applied. That is the bug this whole
    // check exists to catch, so it is worth being exact about.
    const boxed = cols.length >= 4 && cols[0] === '' && cols[cols.length - 1] === '';
    const cells = boxed ? cols.slice(1, -1) : cols;
    const l = (cells[0] ?? '').match(/\d{14}/);
    const r = (cells[1] ?? '').match(/\d{14}/);
    if (!l && !r) continue;
    rows++;
    if (l) local.add(l[0]);
    if (r) remote.add(r[0]);
  }
  return { local, remote, rows };
}

/**
 * PURE verdict. Separated so the self-test drives the real decision.
 * @returns {{unapplied: {file:string,version:string}[], orphanRows: string[], unseen: {file:string,version:string}[]}}
 */
export function compare(localFiles, parsed) {
  const unapplied = localFiles.filter((f) => !parsed.remote.has(f.version));
  const fileVersions = new Set(localFiles.map((f) => f.version));
  const orphanRows = [...parsed.remote].filter((v) => !fileVersions.has(v));
  // A file the CLI did not even list as Local means the CLI is reading a
  // different migrations directory from this script.
  const unseen = localFiles.filter((f) => !parsed.local.has(f.version));
  return { unapplied, orphanRows, unseen };
}

// ─── self-test ───────────────────────────────────────────────────────────────

if (process.argv.includes('--self-test')) {
  const sample = [
    '   Local          | Remote         | Time (UTC)          ',
    '  ----------------|----------------|---------------------',
    '   20260628000000 | 20260628000000 | 2026-06-28 00:00:00 ',
    '   20260915000000 |                |                     ',
    '                  | 20260101000000 | 2026-01-01 00:00:00 ',
  ].join('\n');
  const boxed = [
    '  │ Local          │ Remote         │ Time (UTC)          │',
    '  │ 20260628000000 │ 20260628000000 │ 2026-06-28 00:00:00 │',
    '  │ 20260915000000 │                │                     │',
  ].join('\n');

  const cases = [
    ['parses the ASCII table', () => {
      const p = parseMigrationList(sample);
      return p.rows === 3 && p.local.size === 2 && p.remote.size === 2
        && p.remote.has('20260628000000') && p.remote.has('20260101000000');
    }],
    ['parses the box-drawing table', () => {
      const p = parseMigrationList(boxed);
      return p.rows === 2 && p.local.size === 2 && p.remote.size === 1;
    }],
    ['ignores the header and rule lines', () => parseMigrationList(sample).rows === 3],
    ['returns nothing for empty output — which the caller treats as a failure', () => {
      const p = parseMigrationList('');
      return p.rows === 0 && p.local.size === 0 && p.remote.size === 0;
    }],
    ['flags a local file with no remote row', () => {
      const r = compare(
        [{ file: '20260915000000_x.sql', version: '20260915000000' }],
        parseMigrationList(sample),
      );
      return r.unapplied.length === 1 && r.unapplied[0].version === '20260915000000';
    }],
    ['does not flag a file that IS applied', () => {
      const r = compare(
        [{ file: '20260628000000_x.sql', version: '20260628000000' }],
        parseMigrationList(sample),
      );
      return r.unapplied.length === 0;
    }],
    ['reports a remote row with no file', () => {
      const r = compare(
        [{ file: '20260628000000_x.sql', version: '20260628000000' }],
        parseMigrationList(sample),
      );
      return r.orphanRows.length === 1 && r.orphanRows[0] === '20260101000000';
    }],
    ['reports a file the CLI never listed as Local', () => {
      const r = compare(
        [{ file: '20990101000000_x.sql', version: '20990101000000' }],
        parseMigrationList(sample),
      );
      return r.unseen.length === 1;
    }],
    ['versionOf reads the timestamp prefix and rejects a file without one', () =>
      versionOf('20260915123000_leaderboard.sql') === '20260915123000'
      && versionOf('leaderboard.sql') === null],
    ['this repo really has migrations to check (not a vacuous run)', () => localVersions().length >= 50],
  ];
  let bad = 0;
  for (const [label, fn] of cases) {
    let ok = false;
    try { ok = fn() === true; } catch (e) { ok = false; }
    if (ok) console.log(`  ✓ self-test: ${label}`);
    else { bad++; console.error(`  ✗ self-test: ${label}`); }
  }
  if (bad) { console.error(`\n✗ check:migrations self-test failed (${bad})`); process.exit(1); }
  console.log('✓ check:migrations self-test passed');
  if (!process.argv.includes('--live')) process.exit(0);
}

// ─── the live check ──────────────────────────────────────────────────────────

const files = localVersions();
if (files.length === 0) {
  console.error('✗ no migrations found in supabase/migrations — wrong working directory?');
  process.exit(1);
}

const cli = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['supabase', 'migration', 'list', '--linked'],
  { encoding: 'utf8', timeout: 120_000, shell: process.platform === 'win32' },
);

const out = `${cli.stdout ?? ''}`;
const err = `${cli.stderr ?? ''}`;

if (cli.error || cli.status !== 0) {
  console.error('\n✗ could not read the migration ledger — this is a FAILURE, not a skip.');
  console.error(`  exit ${cli.status}${cli.error ? ` (${cli.error.message})` : ''}`);
  const detail = (err || out).split(/\r?\n/).filter(Boolean).slice(-6).join('\n    ');
  if (detail) console.error(`    ${detail}`);
  console.error(
    '\n  Link the project (`npx supabase link`) and log in, then run this again.\n' +
      '  Shipping without knowing which migrations are live is the thing this\n' +
      '  check exists to stop.\n',
  );
  process.exit(1);
}

const parsed = parseMigrationList(out);
if (parsed.rows === 0) {
  console.error('\n✗ the CLI returned no migration rows. Either the output format changed or');
  console.error('  the project is not linked. Not treating that as "nothing to apply".\n');
  console.error(out.slice(0, 1200));
  process.exit(1);
}

const { unapplied, orphanRows, unseen } = compare(files, parsed);

console.log(
  `check:migrations — ${files.length} files in supabase/migrations, ` +
    `${parsed.remote.size} recorded in the live ledger`,
);

if (unseen.length) {
  console.error(`\n✗ ${unseen.length} migration file(s) the CLI did not list at all:`);
  for (const f of unseen) console.error(`    ${f.file}`);
  console.error('  The CLI is reading a different migrations directory than this script.\n');
  process.exit(1);
}

if (orphanRows.length) {
  console.warn(`\n! ${orphanRows.length} ledger row(s) with no file in the repo:`);
  for (const v of orphanRows) console.warn(`    ${v}`);
  console.warn('  Not a blocker, but the schema is not fully reproducible from this repo.');
}

if (unapplied.length) {
  console.error(`\n✗ ${unapplied.length} migration(s) in the repo are NOT in the live ledger:\n`);
  for (const f of unapplied) console.error(`    ${f.file}`);
  console.error(
    '\n  Do NOT run `supabase db push` on the strength of this list alone — some of\n' +
      '  these may already be applied under a different recorded timestamp, and\n' +
      '  re-running them would fail or duplicate objects. Verify each against the\n' +
      '  live schema, then `supabase migration repair` the ones already applied and\n' +
      '  apply the rest. SHIP_CHECKLIST_2026-09-15.md §1 has the worked list.\n',
  );
  process.exit(1);
}

console.log('✓ every migration in the repo is recorded in the live ledger');
