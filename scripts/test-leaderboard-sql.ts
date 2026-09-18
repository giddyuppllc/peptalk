/**
 * test:leaderboard-sql — run the leaderboard migration in a THROWAWAY Postgres
 * and prove the security and the numbers, not just the SQL text.
 *
 *   npm run test:leaderboard-sql            (needs Docker; nothing touches Supabase)
 *
 * WHY A REAL DATABASE
 * The two failures that matter here are both invisible in the SQL:
 *   - `REVOKE ... FROM PUBLIC` reads correctly and locks nothing on Supabase,
 *     because default privileges grant EXECUTE to anon/authenticated by name.
 *     This harness installs those same default privileges, so a migration
 *     relying on the PUBLIC idiom FAILS here.
 *   - SECURITY DEFINER bypasses RLS, so the opt-in predicate is the only gate.
 *     Only executing the function as a real `authenticated` caller shows who
 *     comes back.
 *
 * WHAT IT DOES
 *   1. starts postgres in Docker (removed on exit)
 *   2. installs a minimal Supabase shim: anon/authenticated/service_role,
 *      auth.users, auth.uid() from request.jwt.claims, Supabase's default grants
 *   3. applies EVERY file in supabase/migrations in order (ones that need
 *      Supabase-only extensions may fail; the ones the leaderboard depends on
 *      must succeed, and the leaderboard migration itself must)
 *   4. seeds src/lib/__tests__/leaderboardFixture.ts, writing each opt-in AS
 *      THAT USER through RLS
 *   5. asserts: numbers == the pure TS rules; non-opted users never returned;
 *      blocks honoured; opt-out is immediate; no sentinel (email, name,
 *      weight, compound, notes) in any payload; result columns == allowlist;
 *      anon cannot execute; internals not callable by authenticated.
 *
 * Exits non-zero on any failure. Not in verify:all because CI has no Docker.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LEADERBOARD_METRICS,
  checkinStreak,
  doseAdherencePct,
  milestoneEvents,
  rankLeaderboard,
  workoutsInWindow,
  type CandidateUser,
  type LeaderboardMetric,
} from '../src/lib/leaderboardMetrics';
import {
  ALLOWED_LEADERBOARD_FIELDS,
  ALLOWED_MY_METRICS_FIELDS,
  ALLOWED_SHOUTOUT_FIELDS,
} from '../src/lib/leaderboardPayload';
import {
  FIXTURE_BLOCKS,
  FIXTURE_USERS,
  SENTINELS,
  userInputs,
  type FixtureUser,
} from '../src/lib/__tests__/leaderboardFixture';

const ROOT = join(__dirname, '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const LEADERBOARD_MIGRATION = '20260915200000_community_leaderboard.sql';
const IMAGE = process.env.LEADERBOARD_PG_IMAGE ?? 'postgres:17-alpine';
const CONTAINER = `peptalk-lb-test-${process.pid}`;

/** Migrations the leaderboard's objects depend on. Each must apply cleanly. */
const REQUIRED = [
  '20260420000000_initial_schema.sql',
  '20260423000000_data_layer.sql',
  '20260503000000_community_phase1.sql',
  '20260523000000_public_profiles_table.sql',
  '20260628000000_client_text_ids.sql',
  '20260628000001_dose_source_planned.sql',
  '20260825000000_active_protocols_text_id.sql',
  LEADERBOARD_MIGRATION,
];

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passes++;
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  }
}

function docker(args: string[], input?: string): { status: number; out: string; err: string } {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' };
}

function psql(sql: string, opts: { single?: boolean } = {}): { status: number; out: string; err: string } {
  const args = ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-q'];
  if (opts.single) args.push('-1');
  return docker(args, sql);
}

function psqlOk(sql: string): string {
  const r = psql(sql);
  if (r.status !== 0) throw new Error(`psql failed:\n${r.err}\n--- sql ---\n${sql.slice(0, 2000)}`);
  return r.out;
}

/** Run statements as a signed-in user (or anon) and return the RESULT: line's JSON. */
function asRole(role: 'anon' | 'authenticated', sub: string | null, query: string): { ok: boolean; json: unknown; err: string } {
  const claims = sub ? JSON.stringify({ sub, role: role }) : JSON.stringify({ role });
  const sql = `
SET ROLE ${role};
SELECT set_config('request.jwt.claims', '${claims}', false) \\g /dev/null
SELECT 'RESULT:' || coalesce((SELECT jsonb_agg(r)::text FROM (${query}) r), '[]');
`;
  const r = psql(sql);
  const line = r.out.split('\n').find((l) => l.startsWith('RESULT:'));
  return { ok: r.status === 0 && !!line, json: line ? JSON.parse(line.slice(7)) : null, err: r.err };
}

function execAs(role: 'anon' | 'authenticated', sub: string | null, statement: string): { ok: boolean; out: string; err: string } {
  const claims = sub ? JSON.stringify({ sub, role }) : JSON.stringify({ role });
  const r = psql(`
SET ROLE ${role};
SELECT set_config('request.jwt.claims', '${claims}', false) \\g /dev/null
${statement}
`);
  return { ok: r.status === 0, out: r.out, err: r.err };
}

const SUPABASE_SHIM = `
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN NOINHERIT;
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO postgres;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid
$f$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT coalesce(
    current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$f$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$f$;
GRANT USAGE ON SCHEMA auth, public, extensions TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

-- Supabase's default privileges: the reason REVOKE ... FROM PUBLIC is not enough.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

function lit(v: string | number | boolean | null): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

function seedSql(today: string): string {
  const out: string[] = [];
  for (const u of FIXTURE_USERS) {
    // EVERY user carries the sentinel, opted in or not — a leak of an opted-in
    // user's email is as much a failure as a non-opted-in one's.
    const email = `${u.key}.${SENTINELS.email}`;
    out.push(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (${lit(u.id)}, ${lit(email)}, ` +
        `${lit(JSON.stringify({ first_name: SENTINELS.firstName, last_name: SENTINELS.lastName, name: SENTINELS.firstName }))}::jsonb);`,
    );
    out.push(
      `UPDATE public.profiles SET username = ${lit(u.username)}, display_name = ${lit(u.displayName)}, ` +
        `first_name = ${lit(SENTINELS.firstName)}, last_name = ${lit(SENTINELS.lastName)} WHERE id = ${lit(u.id)};`,
    );
    const inp = userInputs(u, today);
    for (const d of inp.checkinDates) {
      out.push(
        `INSERT INTO public.check_ins (id, user_id, date, weight_lbs, notes, mood) VALUES ` +
          `(${lit(`checkin-${u.key}-${d}`)}, ${lit(u.id)}, ${lit(d)}, ${SENTINELS.weightLbs}, ${lit(SENTINELS.notes)}, 4);`,
      );
    }
    u.protocols.forEach((p, i) => {
      const ip = inp.protocols[i];
      out.push(
        `INSERT INTO public.active_protocols (id, user_id, peptide_id, peptide_name, dose_amount, dose_unit, frequency, start_date, end_date, is_active) VALUES ` +
          `(${lit(`proto-${u.key}-${i}`)}, ${lit(u.id)}, ${lit(p.peptideId)}, ${lit(SENTINELS.peptideName)}, 250, 'mcg', ${lit(p.frequency)}, ` +
          `${lit(ip.startDate)}, ${lit(ip.endDate)}, ${p.isActive});`,
      );
    });
    inp.doses.forEach((d, i) => {
      out.push(
        `INSERT INTO public.dose_logs (id, user_id, peptide_id, peptide_name, amount, unit, date, notes, source) VALUES ` +
          `(${lit(`dose-${u.key}-${i}`)}, ${lit(u.id)}, ${lit(d.peptideId)}, ${lit(SENTINELS.peptideName)}, 250, 'mcg', ${lit(d.date)}, ${lit(SENTINELS.notes)}, ${lit(d.source)});`,
      );
    });
    inp.workouts.forEach((w, i) => {
      out.push(
        `INSERT INTO public.workout_logs (id, user_id, started_at, completed_at, notes, workout_name) VALUES ` +
          `(${lit(`workout-${u.key}-${i}`)}, ${lit(u.id)}, ${lit(w.completedAt ?? `${today}T10:00:00.000Z`)}, ${lit(w.completedAt)}, ${lit(SENTINELS.notes)}, 'Session');`,
      );
    });
  }
  for (const [blocker, blocked] of FIXTURE_BLOCKS) {
    const a = FIXTURE_USERS.find((u) => u.key === blocker)!;
    const b = FIXTURE_USERS.find((u) => u.key === blocked)!;
    out.push(`INSERT INTO public.community_blocks (blocker_id, blocked_id) VALUES (${lit(a.id)}, ${lit(b.id)});`);
  }
  return out.join('\n');
}

const byKey = (k: string): FixtureUser => FIXTURE_USERS.find((u) => u.key === k)!;

function expectedMetrics(u: FixtureUser, today: string): Record<LeaderboardMetric, number | null> {
  const inp = userInputs(u, today);
  return {
    checkin_streak: checkinStreak(inp.checkinDates, today),
    dose_adherence_30d: doseAdherencePct(inp.protocols, inp.doses, today),
    workouts_30d: workoutsInWindow(inp.workouts, today),
  };
}

function candidates(today: string, optIns: Record<string, boolean | undefined>, viewer: string): CandidateUser[] {
  const blockedForViewer = new Set(
    FIXTURE_BLOCKS.filter(([a, b]) => a === viewer || b === viewer).map(([a, b]) => (a === viewer ? b : a)),
  );
  return FIXTURE_USERS.filter((u) => !blockedForViewer.has(u.key)).map((u) => ({
    userId: u.id,
    optIn: optIns[u.key],
    metrics: expectedMetrics(u, today),
  }));
}

/**
 * `--require-docker` is the mode verify:all runs.
 *
 * This test was outside verify:all because CI has no Docker, which meant the
 * only thing standing between the leaderboard RLS policies and production was
 * somebody remembering to run it by hand. A check nobody runs is not in the
 * net.
 *
 * So it is in the chain now, and the absence of Docker is REPORTED rather than
 * skipped past:
 *
 *   Docker present            run the real test.
 *   absent, CI set            exit 1. CI must either provide Docker or the
 *                             opt-out below; it may not quietly not-check.
 *   absent, local             loud SKIPPED banner, exit 0, so a laptop without
 *                             Docker can still run verify:all.
 *   LEADERBOARD_SQL_OPTIONAL=1  deliberate opt-out, prints that it is opting
 *                             out, everywhere including CI.
 *
 * Without the flag it behaves as before: no Docker is a hard exit 2.
 */
function reportNoDocker(): never {
  const optedOut = process.env.LEADERBOARD_SQL_OPTIONAL === '1';
  const ci = !!process.env.CI;
  const banner = [
    '',
    '  ┌─────────────────────────────────────────────────────────────────┐',
    '  │  LEADERBOARD SQL TESTS DID NOT RUN — no Docker daemon           │',
    '  │  The leaderboard RLS policies and the opt-in join are UNCHECKED │',
    '  └─────────────────────────────────────────────────────────────────┘',
    '',
  ].join('\n');
  if (optedOut) {
    console.warn(banner);
    console.warn('  LEADERBOARD_SQL_OPTIONAL=1 — skipping on purpose. Run it before shipping.\n');
    process.exit(0);
  }
  if (ci) {
    console.error(banner);
    console.error(
      '  CI is set and Docker is missing. Give the job a Docker service, or set\n' +
        '  LEADERBOARD_SQL_OPTIONAL=1 to record that this run does not check it.\n',
    );
    process.exit(1);
  }
  console.warn(banner);
  console.warn(
    '  Skipping locally. Run `npm run test:leaderboard-sql` with Docker up\n' +
      '  before any release — this is on the ship checklist.\n',
  );
  process.exit(0);
}

function main(): void {
  const info = docker(['version', '--format', '{{.Server.Version}}']);
  if (info.status !== 0) {
    if (process.argv.includes('--require-docker')) reportNoDocker();
    console.error('Docker is not available — this test needs a local Docker daemon.');
    process.exit(2);
  }

  console.log(`\n━━━ Leaderboard migration — throwaway Postgres (${IMAGE}) ━━━`);
  const run = docker(['run', '-d', '--rm', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=throwaway', IMAGE]);
  if (run.status !== 0) {
    console.error(`could not start ${IMAGE}:\n${run.err}`);
    process.exit(2);
  }
  const cleanup = () => docker(['rm', '-f', CONTAINER]);
  process.on('exit', cleanup);

  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      ready = docker(['exec', CONTAINER, 'pg_isready', '-U', 'postgres']).status === 0 &&
        psql('SELECT 1').status === 0;
      if (!ready) execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},500)']);
    }
    if (!ready) throw new Error('postgres did not become ready');
    console.log(`  server ${psqlOk('SHOW server_version').trim()}`);

    psqlOk(SUPABASE_SHIM);

    // ── apply every migration, in order ───────────────────────────────────
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    const failed: string[] = [];
    for (const f of files) {
      const r = psql(readFileSync(join(MIGRATIONS, f), 'utf8'), { single: true });
      if (r.status !== 0) failed.push(`${f}: ${r.err.split('\n').find((l) => l.includes('ERROR')) ?? r.err.trim()}`);
    }
    console.log(`  applied ${files.length - failed.length}/${files.length} migrations`);
    for (const f of failed) console.log(`    (skipped — needs Supabase-only objects) ${f}`);
    for (const req of REQUIRED) {
      check(`required migration applies: ${req}`, !failed.some((f) => f.startsWith(req)));
    }
    if (failed.some((f) => REQUIRED.some((r) => f.startsWith(r)))) throw new Error('a required migration failed');

    const today = psqlOk(`SELECT (now() AT TIME ZONE 'UTC')::date`).trim();
    console.log(`  today (UTC) ${today}\n`);
    psqlOk(seedSql(today));

    // Opt-ins are written by each user, through RLS — the path the app uses.
    for (const u of FIXTURE_USERS) {
      if (u.optIn === undefined) continue;
      const r = execAs('authenticated', u.id, `UPDATE public.profiles SET leaderboard_opt_in = ${u.optIn} WHERE id = '${u.id}';`);
      check(`${u.key} can set their own opt-in through RLS`, r.ok, r.err);
    }

    const optIns: Record<string, boolean | undefined> = Object.fromEntries(FIXTURE_USERS.map((u) => [u.key, u.optIn]));

    // ── 1. default is OFF ─────────────────────────────────────────────────
    const def = psqlOk(`SELECT leaderboard_opt_in FROM public.profiles WHERE id = '${byKey('dave').id}'`).trim();
    check('an untouched account defaults to leaderboard_opt_in = false', def === 'f', def);

    // ── 2. derivation: SQL numbers == pure TS rules, for EVERY user ───────
    const allIds = FIXTURE_USERS.map((u) => `'${u.id}'`).join(',');
    const sqlMetrics = JSON.parse(
      psqlOk(`SELECT json_agg(m) FROM public._leaderboard_metrics_for(ARRAY[${allIds}]::uuid[], '${today}') m`).trim(),
    ) as { user_id: string; checkin_streak: number; dose_adherence_30d: number | null; workouts_30d: number }[];
    for (const u of FIXTURE_USERS) {
      const got = sqlMetrics.find((m) => m.user_id === u.id);
      const want = expectedMetrics(u, today);
      for (const metric of LEADERBOARD_METRICS) {
        check(`metric ${metric} for ${u.key}: SQL ${got?.[metric]} == TS ${want[metric]}`, got?.[metric] === want[metric]);
      }
    }

    const sqlEvents = JSON.parse(
      psqlOk(`SELECT coalesce(json_agg(e), '[]') FROM public._leaderboard_milestones_for(ARRAY[${allIds}]::uuid[], '${today}') e`).trim(),
    ) as { user_id: string; kind: string; threshold: number; achieved_on: string }[];
    for (const u of FIXTURE_USERS) {
      const inp = userInputs(u, today);
      const want = milestoneEvents(inp.checkinDates, inp.workouts, today)
        .map((e) => `${e.kind}:${e.threshold}:${e.achievedOn}`)
        .sort();
      const got = sqlEvents
        .filter((e) => e.user_id === u.id)
        .map((e) => `${e.kind}:${e.threshold}:${e.achieved_on}`)
        .sort();
      check(`milestones for ${u.key}: SQL == TS (${want.length})`, JSON.stringify(got) === JSON.stringify(want), { got, want });
    }

    // ── 3. gating: the public board, as a real signed-in viewer ───────────
    const sensitive = [
      SENTINELS.email, SENTINELS.firstName, SENTINELS.lastName, SENTINELS.peptideName,
      SENTINELS.peptideId, SENTINELS.notes, String(SENTINELS.weightLbs), 'mcg',
    ];
    const optedOutIds = FIXTURE_USERS.filter((u) => u.optIn !== true).map((u) => u.id);
    const allPayloads: string[] = [];

    for (const viewer of ['alice', 'bob', 'dave']) {
      const v = byKey(viewer);
      for (const metric of LEADERBOARD_METRICS) {
        const r = asRole('authenticated', v.id, `SELECT * FROM public.get_community_leaderboard('${metric}')`);
        check(`${viewer} can read the ${metric} board`, r.ok, r.err);
        const rows = (r.json ?? []) as Record<string, unknown>[];
        allPayloads.push(JSON.stringify(rows));
        const want = rankLeaderboard(candidates(today, optIns, viewer), metric);
        const got = rows.map((x) => ({ rank: x.rank, userId: x.user_id, value: x.metric_value }));
        const norm = (a: { rank: unknown; userId: unknown; value: unknown }[]) =>
          JSON.stringify([...a].sort((p, q) => String(p.userId).localeCompare(String(q.userId))));
        check(`${viewer} / ${metric}: board == TS rankLeaderboard (${want.length} rows)`, norm(got) === norm(want), { got, want });
        check(
          `${viewer} / ${metric}: no non-opted-in user returned`,
          rows.every((x) => !optedOutIds.includes(String(x.user_id))),
        );
        check(
          `${viewer} / ${metric}: is_self only on the viewer's own row`,
          rows.every((x) => (x.is_self === true) === (x.user_id === v.id)),
        );
        check(
          `${viewer} / ${metric}: row keys are exactly the allowlist`,
          rows.every((x) => JSON.stringify(Object.keys(x).sort()) === JSON.stringify([...ALLOWED_LEADERBOARD_FIELDS].sort())),
          rows[0] ? Object.keys(rows[0]) : 'no rows',
        );
      }

      const s = asRole('authenticated', v.id, `SELECT * FROM public.get_community_shoutouts()`);
      check(`${viewer} can read shout-outs`, s.ok, s.err);
      const shouts = (s.json ?? []) as Record<string, unknown>[];
      allPayloads.push(JSON.stringify(shouts));
      check(`${viewer} shout-outs: no non-opted-in user`, shouts.every((x) => !optedOutIds.includes(String(x.user_id))));
      check(
        `${viewer} shout-outs: row keys are exactly the allowlist`,
        shouts.every((x) => JSON.stringify(Object.keys(x).sort()) === JSON.stringify([...ALLOWED_SHOUTOUT_FIELDS].sort())),
      );
      const wantShoutUsers = new Set(
        candidates(today, optIns, viewer)
          .filter((c) => c.optIn === true)
          .filter((c) => {
            const u = FIXTURE_USERS.find((f) => f.id === c.userId)!;
            const inp = userInputs(u, today);
            return milestoneEvents(inp.checkinDates, inp.workouts, today).length > 0;
          })
          .map((c) => c.userId),
      );
      const gotShoutUsers = new Set(shouts.map((x) => String(x.user_id)));
      check(
        `${viewer} shout-outs: exactly the opted-in users with a recent milestone`,
        [...wantShoutUsers].every((id) => gotShoutUsers.has(id)) && [...gotShoutUsers].every((id) => wantShoutUsers.has(id)),
        { got: [...gotShoutUsers], want: [...wantShoutUsers] },
      );

      const my = asRole('authenticated', v.id, `SELECT * FROM public.get_my_leaderboard_metrics()`);
      const myRow = ((my.json ?? []) as Record<string, unknown>[])[0] ?? {};
      allPayloads.push(JSON.stringify(my.json));
      const wantMine = expectedMetrics(v, today);
      check(
        `${viewer} own metrics == TS, keys == allowlist`,
        my.ok &&
          LEADERBOARD_METRICS.every((m) => myRow[m] === wantMine[m]) &&
          JSON.stringify(Object.keys(myRow).sort()) === JSON.stringify([...ALLOWED_MY_METRICS_FIELDS].sort()),
        { myRow, wantMine, err: my.err },
      );
    }

    // Carol is on bob's board and absent from alice's (alice blocked her).
    const carolId = byKey('carol').id;
    const aliceStreak = asRole('authenticated', byKey('alice').id, `SELECT * FROM public.get_community_leaderboard('checkin_streak')`);
    const bobStreak = asRole('authenticated', byKey('bob').id, `SELECT * FROM public.get_community_leaderboard('checkin_streak')`);
    const carolStreak = asRole('authenticated', carolId, `SELECT * FROM public.get_community_leaderboard('checkin_streak')`);
    const ids = (r: { json: unknown }) => ((r.json ?? []) as { user_id: string }[]).map((x) => x.user_id);
    check('block: the blocker does not see the blocked user', !ids(aliceStreak).includes(carolId));
    check('block: the blocked user does not see the blocker', !ids(carolStreak).includes(byKey('alice').id));
    check('block: a third party still sees both (positive control)', ids(bobStreak).includes(carolId) && ids(bobStreak).includes(byKey('alice').id));

    // ── 4. no sensitive value in ANY payload ──────────────────────────────
    const blob = allPayloads.join('\n');
    check('payloads were actually collected (positive control)', blob.includes('alice_lb') && blob.length > 500);
    for (const s of sensitive) {
      check(`no payload contains sensitive sentinel "${s}"`, !blob.includes(s));
    }

    // ── 5. function signatures: result columns == allowlist ───────────────
    const sig = (fn: string) => psqlOk(`SELECT pg_get_function_result('${fn}'::regprocedure)`).trim();
    const cols = (res: string) =>
      [...res.replace(/^TABLE\(/, '').replace(/\)$/, '').split(',')].map((c) => c.trim().split(/\s+/)[0]).sort();
    check('get_community_leaderboard returns only allowlisted columns',
      JSON.stringify(cols(sig('public.get_community_leaderboard(text,integer)'))) === JSON.stringify([...ALLOWED_LEADERBOARD_FIELDS].sort()),
      sig('public.get_community_leaderboard(text,integer)'));
    check('get_community_shoutouts returns only allowlisted columns',
      JSON.stringify(cols(sig('public.get_community_shoutouts(integer)'))) === JSON.stringify([...ALLOWED_SHOUTOUT_FIELDS].sort()),
      sig('public.get_community_shoutouts(integer)'));
    check('get_my_leaderboard_metrics returns only allowlisted columns',
      JSON.stringify(cols(sig('public.get_my_leaderboard_metrics()'))) === JSON.stringify([...ALLOWED_MY_METRICS_FIELDS].sort()),
      sig('public.get_my_leaderboard_metrics()'));

    // ── 6. grants — the live ACL, not the SQL text ────────────────────────
    const PUBLIC_FNS = [
      'public.get_community_leaderboard(text,integer)',
      'public.get_community_shoutouts(integer)',
      'public.get_my_leaderboard_metrics()',
    ];
    const INTERNAL_FNS = [
      'public._leaderboard_metrics_for(uuid[],date)',
      'public._leaderboard_milestones_for(uuid[],date)',
      'public._leaderboard_doses_per_week(text)',
    ];
    const priv = (role: string, fn: string) =>
      psqlOk(`SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE')`).trim() === 't';
    for (const fn of [...PUBLIC_FNS, ...INTERNAL_FNS]) {
      check(`anon cannot EXECUTE ${fn}`, !priv('anon', fn));
    }
    for (const fn of INTERNAL_FNS) {
      check(`authenticated cannot EXECUTE internal ${fn}`, !priv('authenticated', fn));
    }
    for (const fn of PUBLIC_FNS) {
      check(`authenticated CAN execute ${fn} (positive control)`, priv('authenticated', fn));
    }
    // Same query the repo's verify:rpcgrants runs against the live project.
    const anonExec = psqlOk(`
      SELECT coalesce(string_agg(p.proname, ','), '') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE ANY (ARRAY['%leaderboard%', '%shoutout%'])
         AND (p.proacl IS NULL OR array_to_string(p.proacl::text[], ' ') LIKE '%anon=X%')`).trim();
    check('verify:rpcgrants query finds no anon-executable leaderboard function', anonExec === '', anonExec);

    const anonCall = execAs('anon', null, `SELECT * FROM public.get_community_leaderboard('checkin_streak');`);
    check('anon calling the board is refused with permission denied', !anonCall.ok && /permission denied/i.test(anonCall.err), anonCall.err);
    const anonShout = execAs('anon', null, `SELECT * FROM public.get_community_shoutouts();`);
    check('anon calling shout-outs is refused with permission denied', !anonShout.ok && /permission denied/i.test(anonShout.err), anonShout.err);
    const anonInternal = execAs('authenticated', byKey('alice').id, `SELECT * FROM public._leaderboard_metrics_for(ARRAY['${byKey('dave').id}']::uuid[], current_date);`);
    check('a signed-in user cannot call the ungated internal metrics function', !anonInternal.ok && /permission denied/i.test(anonInternal.err), anonInternal.err);

    const noSub = asRole('authenticated', null, `SELECT * FROM public.get_community_leaderboard('checkin_streak')`);
    check('authenticated role with no user id gets zero rows (defence in depth)', noSub.ok && (noSub.json as unknown[]).length === 0, noSub);

    const badMetric = execAs('authenticated', byKey('alice').id, `SELECT * FROM public.get_community_leaderboard('weight_lbs');`);
    check('an unknown metric name is refused', !badMetric.ok && /unknown leaderboard metric/.test(badMetric.err), badMetric.err);

    const anonProfiles = execAs('anon', null, `SELECT count(*) FROM public.profiles WHERE leaderboard_opt_in;`);
    check('anon reads zero profiles rows (RLS)', anonProfiles.ok && anonProfiles.out.trim().endsWith('0'), anonProfiles);

    // ── 7. a user cannot opt SOMEONE ELSE in ──────────────────────────────
    execAs('authenticated', byKey('alice').id, `UPDATE public.profiles SET leaderboard_opt_in = true WHERE id = '${byKey('dave').id}';`);
    const daveStill = psqlOk(`SELECT leaderboard_opt_in FROM public.profiles WHERE id = '${byKey('dave').id}'`).trim();
    check("alice's UPDATE of dave's opt-in changes nothing (owner-only RLS)", daveStill === 'f', daveStill);

    // ── 8. opt-out is immediate ───────────────────────────────────────────
    const bobId = byKey('bob').id;
    const before = asRole('authenticated', byKey('alice').id, `SELECT * FROM public.get_community_leaderboard('workouts_30d')`);
    check('before opt-out: bob is on the board (positive control)', ids(before).includes(bobId));
    const out = execAs('authenticated', bobId, `UPDATE public.profiles SET leaderboard_opt_in = false WHERE id = '${bobId}';`);
    check('bob can opt himself out', out.ok, out.err);
    const after = asRole('authenticated', byKey('alice').id, `SELECT * FROM public.get_community_leaderboard('workouts_30d')`);
    const afterShout = asRole('authenticated', byKey('alice').id, `SELECT * FROM public.get_community_shoutouts()`);
    check('after opt-out: bob is gone from the board on the very next call', !ids(after).includes(bobId));
    check('after opt-out: bob is gone from shout-outs on the very next call', !ids(afterShout).includes(bobId));
    const bobSelf = asRole('authenticated', bobId, `SELECT * FROM public.get_community_leaderboard('workouts_30d')`);
    check('after opt-out: bob does not see himself either', !ids(bobSelf).includes(bobId));
  } catch (err) {
    failures++;
    console.error(`\n  FAIL  harness error: ${(err as Error).message}`);
  } finally {
    cleanup();
  }

  console.log(`\n  ${passes} passed, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
