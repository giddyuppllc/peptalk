#!/usr/bin/env node
/**
 * verify:onconflict — every upsert `onConflict:` target must match a unique
 * constraint or unique index.
 *
 * WHY THIS EXISTS
 * Postgres refuses `INSERT ... ON CONFLICT (cols)` outright unless a unique
 * index or constraint covers exactly those columns. PostgREST passes the error
 * straight back. `src/services/pushTokenSync.ts` upserted with
 * onConflict: 'expo_push_token' while production only had
 * UNIQUE (user_id, expo_push_token), so every push-token save from 2026-05-17
 * on was refused, the error was logged only under __DEV__, and push reached
 * nobody for four months.
 *
 * TWO MODES
 *   (default)  Replays supabase/migrations in version order and checks every
 *              target against the constraints the repo says exist. Runs in
 *              verify:all; needs no credentials.
 *   --live     Reads unique indexes from the linked production database
 *              (read-only SELECT) and checks the same targets against them.
 *
 * Both exist because they fail differently. The push-token incident was a
 * migration that existed in the repo and never ran: the source mode alone would
 * have passed it. The live mode catches that, but cannot run without a linked
 * project, so it SKIPS LOUDLY rather than pretending to pass.
 *
 * WHAT COUNTS AS A MATCH
 * A PRIMARY KEY, UNIQUE constraint, or UNIQUE index whose column SET equals the
 * target's (order does not matter to Postgres). A partial unique index (WHERE)
 * or an expression index does not match a bare column list, so neither counts.
 *
 * `--self-test` runs the parser against fixtures that must pass and fail, so a
 * parser that silently matches everything (or nothing) is caught.
 */

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const SCAN_DIRS = ['src', 'app', join('supabase', 'functions')];

// ─── SQL side ───────────────────────────────────────────────────────────────

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function ident(raw) {
  return raw.trim().replace(/"/g, '').toLowerCase();
}

function tableName(raw) {
  const parts = ident(raw).split('.');
  return parts[parts.length - 1];
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** The text between the '(' at `open` and its matching ')'. */
function parenBody(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return s.slice(open + 1, i);
    }
  }
  return null;
}

function colList(inner) {
  const cols = splitTopLevel(inner).map((c) => c.trim());
  // An expression (lower(x), x || y) cannot satisfy a bare column target.
  if (cols.some((c) => !/^"?[A-Za-z_][\w$]*"?(\s+(asc|desc))?(\s+nulls\s+(first|last))?$/i.test(c))) {
    return null;
  }
  return cols.map((c) => ident(c.split(/\s+/)[0]));
}

const key = (cols) => [...cols].sort().join(',');

/**
 * Replay migration text into { table -> Map(constraintName -> colKey) }.
 * Only indexes/constraints usable as an ON CONFLICT arbiter are recorded.
 */
export function buildUniqueMap(files) {
  const tables = new Map();
  const tbl = (t) => {
    if (!tables.has(t)) tables.set(t, new Map());
    return tables.get(t);
  };

  for (const { sql } of files) {
    const text = stripSqlComments(sql);
    const starts = /\b(create\s+table|create\s+unique\s+index|alter\s+table|drop\s+index|drop\s+table)\b/gi;
    let m;
    while ((m = starts.exec(text))) {
      const kind = m[1].toLowerCase().replace(/\s+/g, ' ');
      const rest = text.slice(m.index);
      const stmt = rest.slice(0, rest.indexOf(';') === -1 ? rest.length : rest.indexOf(';'));

      if (kind === 'create table') {
        const h = stmt.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)\s*\(/i);
        if (!h) continue;
        const t = tableName(h[1]);
        const body = parenBody(rest, rest.indexOf('(', h[0].length - 1));
        if (body == null) continue;
        const cons = tbl(t);
        for (const item of splitTopLevel(body)) {
          const it = item.trim();
          const named = it.match(/^constraint\s+([\w"]+)\s+(.*)$/is);
          const def = named ? named[2] : it;
          const pk = def.match(/^primary\s+key\s*\(([^)]*)\)/i);
          const uq = def.match(/^unique\s*(?:nulls\s+(?:not\s+)?distinct\s*)?\(([^)]*)\)/i);
          if (pk || uq) {
            const cols = colList((pk || uq)[1]);
            if (!cols) continue;
            const name = named ? ident(named[1]) : pk ? `${t}_pkey` : `${t}_${cols.join('_')}_key`;
            cons.set(name, key(cols));
            continue;
          }
          // Column definition with an inline PRIMARY KEY / UNIQUE.
          const col = it.match(/^"?([A-Za-z_][\w$]*)"?\s+/);
          if (!col || /^(constraint|check|foreign|exclude|like)\b/i.test(it)) continue;
          const c = ident(col[1]);
          const noChecks = it.replace(/\bcheck\s*\([\s\S]*$/i, '');
          if (/\bprimary\s+key\b/i.test(noChecks)) cons.set(`${t}_pkey`, key([c]));
          else if (/\bunique\b/i.test(noChecks)) cons.set(`${t}_${c}_key`, key([c]));
        }
      } else if (kind === 'create unique index') {
        const h = stmt.match(
          /^create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([\w."]+)\s+on\s+(?:only\s+)?([\w."]+)\s*(?:using\s+\w+\s*)?\(/i,
        );
        if (!h) continue;
        const body = parenBody(stmt, h[0].length - 1);
        if (body == null) continue;
        const after = stmt.slice(h[0].length - 1 + body.length + 2);
        if (/\bwhere\b/i.test(after)) continue; // partial: not an arbiter for a bare column list
        const cols = colList(body);
        if (!cols) continue;
        tbl(tableName(h[2])).set(ident(h[1].split('.').pop()), key(cols));
      } else if (kind === 'alter table') {
        const h = stmt.match(/^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)\s+([\s\S]*)$/i);
        if (!h) continue;
        const t = tableName(h[1]);
        for (const action of splitTopLevel(h[2])) {
          const a = action.trim();
          const drop = a.match(/^drop\s+constraint\s+(?:if\s+exists\s+)?([\w"]+)/i);
          if (drop) {
            tbl(t).delete(ident(drop[1]));
            continue;
          }
          const add = a.match(
            /^add\s+(?:constraint\s+([\w"]+)\s+)?(primary\s+key|unique)\s*(?:nulls\s+(?:not\s+)?distinct\s*)?\(([^)]*)\)/i,
          );
          if (add) {
            const cols = colList(add[3]);
            if (!cols) continue;
            const isPk = /primary/i.test(add[2]);
            const name = add[1] ? ident(add[1]) : isPk ? `${t}_pkey` : `${t}_${cols.join('_')}_key`;
            tbl(t).set(name, key(cols));
          }
        }
      } else if (kind === 'drop index') {
        const h = stmt.match(/^drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?([\w."]+)/i);
        if (!h) continue;
        const name = ident(h[1].split('.').pop());
        for (const cons of tables.values()) cons.delete(name);
      } else if (kind === 'drop table') {
        const h = stmt.match(/^drop\s+table\s+(?:if\s+exists\s+)?([\w."]+)/i);
        if (h) tables.delete(tableName(h[1]));
      }
    }
  }
  return tables;
}

function readMigrations() {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ file: f, sql: readFileSync(join(MIGRATIONS, f), 'utf8') }));
}

// ─── Code side ──────────────────────────────────────────────────────────────

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** Resolve `.from(ident)` where ident is typed as a union of string literals. */
function resolveDynamicTable(src, name) {
  const typeRef = src.match(new RegExp(`\\b${name}\\s*:\\s*([A-Za-z_]\\w*)`));
  if (!typeRef) return null;
  const decl = src.match(new RegExp(`type\\s+${typeRef[1]}\\s*=([^;]*);`));
  if (!decl) return null;
  // Comments inside the union (syncService.ts has several) contain apostrophes
  // that would otherwise pair up into bogus "table names".
  const body = decl[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const lits = [...body.matchAll(/'([^'\n]+)'/g)].map((x) => x[1]);
  return lits.length ? lits : null;
}

/**
 * Every onConflict target in `src`, with the table(s) its upsert writes.
 * Comment lines are skipped: several files explain onConflict in prose.
 */
export function findTargets(src, file) {
  const out = [];
  for (const m of src.matchAll(/onConflict\s*:\s*(['"`])([^'"`]+)\1/g)) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const prefix = src.slice(lineStart, m.index);
    if (prefix.includes('//') || /^\s*\*/.test(prefix)) continue;

    const before = src.slice(Math.max(0, m.index - 2000), m.index);
    const froms = [...before.matchAll(/\.from\(\s*(?:(['"`])([^'"`]+)\1|([A-Za-z_]\w*))\s*\)/g)];
    const last = froms[froms.length - 1];
    const line = src.slice(0, m.index).split('\n').length;
    const cols = m[2].split(',').map((c) => ident(c));
    if (!last) {
      out.push({ file, line, cols, tables: null, why: 'no .from(...) before this onConflict' });
      continue;
    }
    if (last[2]) {
      out.push({ file, line, cols, tables: [tableName(last[2])] });
    } else {
      const tables = resolveDynamicTable(src, last[3]);
      out.push({
        file,
        line,
        cols,
        tables,
        why: tables ? undefined : `.from(${last[3]}) is not a string-literal union this check can resolve`,
      });
    }
  }
  return out;
}

function collectTargets() {
  const targets = [];
  for (const d of SCAN_DIRS) {
    for (const p of walk(join(ROOT, d), [])) {
      const rel = relative(ROOT, p).split(sep).join('/');
      targets.push(...findTargets(readFileSync(p, 'utf8'), rel));
    }
  }
  return targets;
}

export function check(targets, uniqueMap) {
  const problems = [];
  let pairs = 0;
  for (const t of targets) {
    if (!t.tables) {
      problems.push(`${t.file}:${t.line}  onConflict '${t.cols.join(',')}': ${t.why}`);
      continue;
    }
    for (const table of t.tables) {
      pairs++;
      const cons = uniqueMap.get(table);
      const want = key(t.cols);
      const ok = cons && [...cons.values()].includes(want);
      if (!ok) {
        const have = cons && cons.size ? [...cons.entries()].map(([n, c]) => `${n}(${c})`).join(', ') : 'none';
        problems.push(
          `${t.file}:${t.line}  ${table} ON CONFLICT (${t.cols.join(', ')}) — no matching unique constraint. Found: ${have}`,
        );
      }
    }
  }
  return { problems, pairs };
}

// ─── Live side ──────────────────────────────────────────────────────────────

const LIVE_SQL = `
SELECT c.relname AS tbl,
       i.relname AS idx,
       array_to_string(ARRAY(
         SELECT a.attname FROM unnest(ix.indkey) WITH ORDINALITY k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
         ORDER BY k.ord), ',') AS cols,
       (ix.indpred IS NOT NULL) AS partial,
       (0 = ANY (ix.indkey::int2[])) AS expr
  FROM pg_index ix
  JOIN pg_class c ON c.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND ix.indisunique;
`;

function liveUniqueMap() {
  const file = join(tmpdir(), `peptalk-onconflict-${process.pid}.sql`);
  writeFileSync(file, LIVE_SQL, 'utf8');
  try {
    // shell:true: npx is npx.cmd on Windows; spawning it without a shell throws
    // EINVAL and would silently take the SKIP path (see verify-rpc-grants.mjs).
    const out = execSync(`npx supabase db query --linked -f "${file}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90_000,
      shell: true,
    });
    const m = out.match(/"rows":\s*(\[[\s\S]*?\])\s*,\s*"(warning|message)"/);
    if (!m) return null;
    const map = new Map();
    for (const r of JSON.parse(m[1])) {
      if (r.partial || r.expr) continue;
      if (!map.has(r.tbl)) map.set(r.tbl, new Map());
      map.get(r.tbl).set(r.idx, key(String(r.cols).split(',')));
    }
    return map;
  } catch {
    return null;
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}

// ─── Self-test ──────────────────────────────────────────────────────────────

function selfTest() {
  const sql = [
    { sql: `CREATE TABLE IF NOT EXISTS public.a (id UUID PRIMARY KEY, u TEXT NOT NULL, v TEXT, UNIQUE (u, v));` },
    { sql: `CREATE TABLE b (id text, code text UNIQUE, note text CHECK (note <> 'unique'));` },
    { sql: `CREATE UNIQUE INDEX IF NOT EXISTS b_note_live ON public.b (note) WHERE note IS NOT NULL;` },
    { sql: `CREATE UNIQUE INDEX b_lower ON public.b (lower(code));` },
    { sql: `-- ALTER TABLE public.a ADD CONSTRAINT fake UNIQUE (v);\nALTER TABLE public.a DROP CONSTRAINT IF EXISTS a_u_v_key;` },
    { sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1) THEN ALTER TABLE public.a ADD CONSTRAINT a_v_key UNIQUE (v); END IF; END $$;` },
  ];
  const map = buildUniqueMap(sql);
  const code = [
    `db.from('a').upsert(x, { onConflict: 'id' });`,
    `db.from('a').upsert(x, { onConflict: 'v' });`,
    `db.from('a').upsert(x, { onConflict: 'u,v' });`,
    `db.from("b").upsert(x, { onConflict: 'code' });`,
    `db.from('b').upsert(x, { onConflict: 'note' });`,
    `// db.from('b').upsert(x, { onConflict: 'nope' }) in a comment`,
    `type T =\n  | 'a'\n  // a comment that isn't a table name\n  | 'b';\nfunction f(table: T) { db.from(table).upsert(r, { onConflict: 'id' }); }`,
  ].join('\n');
  const targets = findTargets(code, 'fixture.ts');
  const { problems } = check(targets, map);
  const expectFail = [
    "a ON CONFLICT (u, v)", // dropped
    "b ON CONFLICT (note)", // only a partial index
    "b ON CONFLICT (id)", // dynamic union resolves to b too; b has no PK
  ];
  const errs = [];
  if (targets.length !== 6) errs.push(`expected 6 targets (comment skipped), got ${targets.length}`);
  for (const f of expectFail) {
    if (!problems.some((p) => p.includes(f))) errs.push(`expected a failure for ${f}`);
  }
  if (problems.length !== expectFail.length) {
    errs.push(`expected ${expectFail.length} problems, got ${problems.length}:\n    ${problems.join('\n    ')}`);
  }
  if (errs.length) {
    console.log('✗ verify:onconflict self-test FAILED');
    for (const e of errs) console.log('  ' + e);
    process.exit(1);
  }
  console.log('✓ verify:onconflict self-test: parser passes and fails the right fixtures');
}

// ─── Main ───────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
if (args.has('--self-test')) {
  selfTest();
  process.exit(0);
}

const targets = collectTargets();
if (targets.length < 10) {
  console.log(`✗ verify:onconflict found only ${targets.length} onConflict targets — the scan is broken, not clean`);
  process.exit(1);
}

let map;
let label;
if (args.has('--live')) {
  map = liveUniqueMap();
  label = 'linked production database';
  if (map === null) {
    console.log('\n— onConflict (live) —\n');
    console.log('  SKIPPED — could not reach the linked database.');
    console.log('  This mode reads LIVE unique indexes; source cannot answer it.');
    console.log('  Run `npx supabase link` and re-run to actually verify.\n');
    process.exit(0);
  }
} else {
  map = buildUniqueMap(readMigrations());
  label = 'supabase/migrations';
}

const { problems, pairs } = check(targets, map);
if (problems.length) {
  console.log(`✗ onConflict: ${problems.length} upsert target(s) with no matching unique constraint in ${label}:`);
  for (const p of problems) console.log('  ' + p);
  console.log('\n  Postgres refuses an ON CONFLICT target that no unique index covers, so');
  console.log('  every one of these writes fails. Add the constraint in a migration, or');
  console.log('  change the target to one that exists.');
  process.exit(1);
}
console.log(`✓ onConflict: ${targets.length} targets (${pairs} table/target pairs) all match a unique constraint in ${label}`);
