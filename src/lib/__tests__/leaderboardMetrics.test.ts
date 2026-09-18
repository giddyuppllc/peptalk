/**
 * Community leaderboard — metric derivation, opt-in gating, and the SQL that
 * must say the same thing.
 *
 * The migration runs on other people's rows, which never reach this device, so
 * jest cannot execute it. What jest CAN do is pin the pure rules and parse the
 * migration for every constant those rules depend on. The numbers themselves
 * are cross-checked against real Postgres by `npm run test:leaderboard-sql`,
 * using the same fixture as below.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CHECKIN_STREAK_THRESHOLDS,
  LEADERBOARD_METRICS,
  METRIC_WINDOW_DAYS,
  SHOUTOUT_WINDOW_DAYS,
  WORKOUT_COUNT_THRESHOLDS,
  addDays,
  checkinStreak,
  doseAdherencePct,
  isOptedIn,
  milestoneEvents,
  rankLeaderboard,
  workoutsInWindow,
  type CandidateUser,
  type LeaderboardMetric,
} from '../leaderboardMetrics';
import { dosesPerWeekFor } from '../../utils/doseAdherence';
import { ALLOWED_LEADERBOARD_FIELDS, ALLOWED_MY_METRICS_FIELDS, ALLOWED_SHOUTOUT_FIELDS } from '../leaderboardPayload';
import { FIXTURE_BLOCKS, FIXTURE_USERS, userInputs } from './leaderboardFixture';

const ROOT = path.join(__dirname, '..', '..', '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260915200000_community_leaderboard.sql'),
  'utf8',
);
const TODAY = '2026-09-15';

/** The body of one CREATE FUNCTION, from its header to the next CREATE or GRANT section. */
function functionBlock(name: string): string {
  const start = MIGRATION.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in migration`);
  const next = MIGRATION.indexOf('CREATE OR REPLACE FUNCTION', start + 10);
  const grants = MIGRATION.indexOf('-- ── 8. Grants', start);
  const end = [next, grants].filter((i) => i > start).sort((a, b) => a - b)[0] ?? MIGRATION.length;
  return MIGRATION.slice(start, end);
}

function returnsTableColumns(name: string): string[] {
  const block = functionBlock(name);
  const m = block.match(/RETURNS TABLE \(([\s\S]*?)\)\s*\n\s*LANGUAGE/);
  if (!m) throw new Error(`no RETURNS TABLE for ${name}`);
  return m[1]
    .split(',')
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean)
    .sort();
}

// ── check-in streak ─────────────────────────────────────────────────────────

describe('checkinStreak', () => {
  const d = (o: number) => addDays(TODAY, o);

  it('counts consecutive days ending today', () => {
    expect(checkinStreak([d(0), d(-1), d(-2)], TODAY)).toBe(3);
  });

  it('keeps a streak that ended yesterday (UTC vs local date grace)', () => {
    expect(checkinStreak([d(-1), d(-2)], TODAY)).toBe(2);
  });

  it('zeroes a streak that lapsed two days ago', () => {
    expect(checkinStreak([d(-2), d(-3), d(-4)], TODAY)).toBe(0);
  });

  it('counts a check-in dated tomorrow (east of UTC), and nothing further out', () => {
    expect(checkinStreak([d(1), d(0)], TODAY)).toBe(2);
    expect(checkinStreak([d(2), d(1), d(0)], TODAY)).toBe(2);
  });

  it('ignores duplicate dates and breaks on a gap', () => {
    expect(checkinStreak([d(0), d(0), d(-1), d(-3), d(-4)], TODAY)).toBe(2);
  });

  it('is 0 with no check-ins', () => {
    expect(checkinStreak([], TODAY)).toBe(0);
  });
});

// ── dose adherence ──────────────────────────────────────────────────────────

describe('doseAdherencePct', () => {
  const d = (o: number) => addDays(TODAY, o);
  const daily = { peptideId: 'p', frequency: 'daily', startDate: d(-9), endDate: null, isActive: true };

  it('is null when nothing was expected (no active protocol)', () => {
    expect(doseAdherencePct([], [{ peptideId: 'p', date: d(0), source: 'user' }], TODAY)).toBeNull();
    expect(doseAdherencePct([{ ...daily, isActive: false }], [], TODAY)).toBeNull();
  });

  it('logged / expected over the protocol days inside the window', () => {
    const doses = [0, -1, -2, -3, -4].map((o) => ({ peptideId: 'p', date: d(o), source: 'user' }));
    expect(doseAdherencePct([daily], doses, TODAY)).toBe(50); // 5 of 10
  });

  it('does not count planned (scheduled, untaken) doses', () => {
    const doses = [0, -1].map((o) => ({ peptideId: 'p', date: d(o), source: 'planned' }));
    expect(doseAdherencePct([daily], doses, TODAY)).toBe(0);
  });

  it('caps each protocol at its expected count — extra doses cannot climb the board', () => {
    const doses = Array.from({ length: 40 }, () => ({ peptideId: 'p', date: d(0), source: 'user' }));
    expect(doseAdherencePct([daily], doses, TODAY)).toBe(100);
    const two = [daily, { ...daily, peptideId: 'q' }];
    // 40 on p cannot cover 0 of 10 on q
    expect(doseAdherencePct(two, doses, TODAY)).toBe(50);
  });

  it('only matches doses to their own protocol', () => {
    const doses = [0, -1].map((o) => ({ peptideId: 'other', date: d(o), source: 'user' }));
    expect(doseAdherencePct([daily], doses, TODAY)).toBe(0);
  });

  it('clips the window to the last 30 days and to the protocol end date', () => {
    const long = { ...daily, startDate: d(-100) };
    const doses = [-40, -35].map((o) => ({ peptideId: 'p', date: d(o), source: 'user' }));
    expect(doseAdherencePct([long], doses, TODAY)).toBe(0); // both outside window, 30 expected
    const ended = { ...daily, startDate: d(-100), endDate: d(-31) };
    expect(doseAdherencePct([ended], doses, TODAY)).toBeNull();
  });

  it('never expects fewer than one dose (monthly over two weeks)', () => {
    const monthly = { peptideId: 'p', frequency: 'monthly', startDate: d(-13), endDate: null, isActive: true };
    expect(doseAdherencePct([monthly], [], TODAY)).toBe(0);
    expect(doseAdherencePct([monthly], [{ peptideId: 'p', date: d(-1), source: 'user' }], TODAY)).toBe(100);
  });
});

// ── workouts ────────────────────────────────────────────────────────────────

describe('workoutsInWindow', () => {
  it('counts completed workouts in the last 30 UTC days, inclusive', () => {
    const at = (o: number) => ({ completedAt: `${addDays(TODAY, o)}T23:30:00.000Z` });
    expect(workoutsInWindow([at(0), at(-29), at(-30), { completedAt: null }], TODAY)).toBe(2);
    expect(METRIC_WINDOW_DAYS).toBe(30);
  });
});

/**
 * A row we cannot date must be dropped, not thrown over.
 *
 * `new Date('nonsense').toISOString()` does not return a bad string — it throws
 * RangeError: Invalid time value. `completedAt` is read straight off a server
 * row (useWorkoutStore.ts:549, `r.completed_at`), so one malformed value
 * anywhere in a user's history threw out of the leaderboard's render. The only
 * error boundary in the app is at the root, so that is not a broken card — it
 * is the whole app replaced by the fallback screen.
 */
describe('a malformed completedAt cannot crash the leaderboard', () => {
  const BAD = ['nonsense', '', '2026-13-45', 'yesterday', '  ', 'NaN', '0000-00-00'];

  it.each(BAD)('workoutsInWindow survives %p', (bad) => {
    expect(() => workoutsInWindow([{ completedAt: bad }], TODAY)).not.toThrow();
    expect(workoutsInWindow([{ completedAt: bad }], TODAY)).toBe(0);
  });

  it.each(BAD)('milestoneEvents survives %p on its own', (bad) => {
    // A single bad row is the reliable trigger: WORKOUT_COUNT_THRESHOLDS starts
    // at 1, so the old code reached `new Date(NaN).toISOString()` on the very
    // first threshold. The first draft of this test padded with ten good rows,
    // where a NaN can sort anywhere and the throw only sometimes happened —
    // it passed against the unfixed code, which is worse than no test.
    expect(() => milestoneEvents([], [{ completedAt: bad }], TODAY)).not.toThrow();
    expect(milestoneEvents([], [{ completedAt: bad }], TODAY)).toEqual([]);
  });

  it.each(BAD)('milestoneEvents survives %p mixed in with real workouts', (bad) => {
    const good = Array.from({ length: 10 }, (_, i) => ({ completedAt: `${addDays(TODAY, -i)}T12:00:00.000Z` }));
    expect(() => milestoneEvents([], [...good, { completedAt: bad }], TODAY)).not.toThrow();
  });

  it('drops the bad row without disturbing the good ones', () => {
    const at = (o: number) => ({ completedAt: `${addDays(TODAY, o)}T23:30:00.000Z` });
    const clean = workoutsInWindow([at(0), at(-1)], TODAY);
    const dirty = workoutsInWindow([at(0), { completedAt: 'nonsense' }, at(-1)], TODAY);
    expect(dirty).toBe(clean);
  });

  it('still dates a workout milestone on the right day with a bad row present', () => {
    // 10 workouts, oldest first; the 5th chronologically is 5 days back.
    const days = Array.from({ length: 10 }, (_, i) => addDays(TODAY, -(9 - i)));
    const workouts = days.map((d) => ({ completedAt: `${d}T08:00:00.000Z` }));
    const withBad = [...workouts, { completedAt: 'not-a-date' }];
    const a = milestoneEvents([], workouts, TODAY).filter((e) => e.kind === 'workout_count');
    const b = milestoneEvents([], withBad, TODAY).filter((e) => e.kind === 'workout_count');
    expect(b).toEqual(a);
  });
});

// ── milestones ──────────────────────────────────────────────────────────────

describe('milestoneEvents', () => {
  const d = (o: number) => addDays(TODAY, o);

  it('dates a streak milestone on the day the run crossed the threshold', () => {
    const run = [0, -1, -2, -3, -4, -5, -6].map(d); // 7-day run starting d(-6)
    const ev = milestoneEvents(run, [], TODAY);
    expect(ev).toEqual([
      { kind: 'checkin_streak', threshold: 7, achievedOn: d(0) },
      { kind: 'checkin_streak', threshold: 3, achievedOn: d(-4) },
    ]);
  });

  it('dates workout milestones on the 1st and 10th completion', () => {
    const w = Array.from({ length: 10 }, (_, i) => ({ completedAt: `${d(-9 + i)}T12:00:00.000Z` }));
    const ev = milestoneEvents([], w, TODAY);
    expect(ev).toEqual([
      { kind: 'workout_count', threshold: 10, achievedOn: d(0) },
      { kind: 'workout_count', threshold: 1, achievedOn: d(-9) },
    ]);
  });

  it('only shouts out milestones from the last 14 days', () => {
    const old = [-20, -21, -22].map(d);
    expect(milestoneEvents(old, [], TODAY)).toEqual([]);
    expect(SHOUTOUT_WINDOW_DAYS).toBe(14);
  });
});

// ── the gate ────────────────────────────────────────────────────────────────

describe('opt-in gating', () => {
  const metrics = (v: number): Record<LeaderboardMetric, number | null> => ({
    checkin_streak: v,
    dose_adherence_30d: v,
    workouts_30d: v,
  });

  it('only a literal true opts in', () => {
    expect(isOptedIn(true)).toBe(true);
    for (const v of [false, null, undefined, 'true', 1, {}, []]) {
      expect(isOptedIn(v)).toBe(false);
    }
  });

  it('a default-off user never appears, however good their numbers', () => {
    const users: CandidateUser[] = [
      { userId: 'in', optIn: true, metrics: metrics(3) },
      { userId: 'default', optIn: undefined, metrics: metrics(999) },
      { userId: 'null', optIn: null, metrics: metrics(999) },
      { userId: 'off', optIn: false, metrics: metrics(999) },
      { userId: 'stringy', optIn: 'true' as unknown as boolean, metrics: metrics(999) },
    ];
    for (const m of LEADERBOARD_METRICS) {
      expect(rankLeaderboard(users, m).map((r) => r.userId)).toEqual(['in']);
    }
  });

  it('leaves off zero / missing values and shares ranks on ties', () => {
    const users: CandidateUser[] = [
      { userId: 'a', optIn: true, metrics: { checkin_streak: 5, dose_adherence_30d: null, workouts_30d: 0 } },
      { userId: 'b', optIn: true, metrics: { checkin_streak: 5, dose_adherence_30d: 80, workouts_30d: 2 } },
      { userId: 'c', optIn: true, metrics: { checkin_streak: 2, dose_adherence_30d: 0, workouts_30d: 2 } },
    ];
    expect(rankLeaderboard(users, 'checkin_streak').map((r) => [r.userId, r.rank])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ]);
    expect(rankLeaderboard(users, 'dose_adherence_30d').map((r) => r.userId)).toEqual(['b']);
    expect(rankLeaderboard(users, 'workouts_30d').map((r) => r.userId)).toEqual(['b', 'c']);
  });
});

// ── the shared fixture (also seeded into Postgres) ─────────────────────────

describe('shared fixture', () => {
  const candidates = (): CandidateUser[] =>
    FIXTURE_USERS.map((u) => {
      const inp = userInputs(u, TODAY);
      return {
        userId: u.id,
        optIn: u.optIn,
        metrics: {
          checkin_streak: checkinStreak(inp.checkinDates, TODAY),
          dose_adherence_30d: doseAdherencePct(inp.protocols, inp.doses, TODAY),
          workouts_30d: workoutsInWindow(inp.workouts, TODAY),
        },
      };
    });

  it('pins the numbers the SQL run is checked against', () => {
    const byKey = Object.fromEntries(FIXTURE_USERS.map((u, i) => [u.key, candidates()[i].metrics]));
    expect(byKey.alice).toEqual({ checkin_streak: 10, dose_adherence_30d: 81, workouts_30d: 12 });
    expect(byKey.bob).toEqual({ checkin_streak: 7, dose_adherence_30d: 33, workouts_30d: 3 });
    expect(byKey.dave).toEqual({ checkin_streak: 41, dose_adherence_30d: 100, workouts_30d: 15 });
    expect(byKey.frank).toEqual({ checkin_streak: 0, dose_adherence_30d: null, workouts_30d: 0 });
    expect(byKey.grace).toEqual({ checkin_streak: 3, dose_adherence_30d: 0, workouts_30d: 0 });
  });

  it('dave (never opted in) and erin (opted out) are on no board — and would top them if the gate broke', () => {
    const c = candidates();
    const hidden = FIXTURE_USERS.filter((u) => u.optIn !== true).map((u) => u.id);
    expect(hidden).toHaveLength(2);
    for (const m of LEADERBOARD_METRICS) {
      const ids = rankLeaderboard(c, m).map((r) => r.userId);
      for (const h of hidden) expect(ids).not.toContain(h);
      // positive control: with the gate forced open, dave leads every board
      const open = rankLeaderboard(c.map((x) => ({ ...x, optIn: true })), m);
      expect(open[0].userId).toBe(FIXTURE_USERS.find((u) => u.key === 'dave')!.id);
    }
  });

  it('has a block pair for the SQL run to honour', () => {
    expect(FIXTURE_BLOCKS.length).toBeGreaterThan(0);
  });
});

// ── the migration must say the same thing ──────────────────────────────────

describe('migration agrees with the pure rules', () => {
  it('frequency → doses/week CASE matches dosesPerWeekFor for every frequency', () => {
    const block = functionBlock('_leaderboard_doses_per_week');
    const pairs = [...block.matchAll(/WHEN '([a-z_]+)'\s+THEN ([\d.]+)/g)].map((m) => [m[1], Number(m[2])] as const);
    expect(pairs.length).toBe(8);
    for (const [freq, n] of pairs) {
      expect([freq, n]).toEqual([freq, dosesPerWeekFor(freq as never)]);
    }
    const fallback = block.match(/ELSE ([\d.]+)/);
    expect(Number(fallback?.[1])).toBe(dosesPerWeekFor('custom'));
  });

  it('streak and workout thresholds match the TS constants', () => {
    const block = functionBlock('_leaderboard_milestones_for');
    const streak = block.match(/unnest\(ARRAY\[([\d,\s]+)\]\)/);
    const workout = block.match(/ws\.n = ANY \(ARRAY\[([\d,\s]+)\]\)/);
    expect(streak?.[1].split(',').map(Number)).toEqual([...CHECKIN_STREAK_THRESHOLDS]);
    expect(workout?.[1].split(',').map(Number)).toEqual([...WORKOUT_COUNT_THRESHOLDS]);
  });

  it('the TS thresholds ARE the existing badge thresholds (useAchievementStore BADGES)', () => {
    const store = fs.readFileSync(path.join(ROOT, 'src', 'store', 'useAchievementStore.ts'), 'utf8');
    const streaks = [...store.matchAll(/condition: 'streak_(\d+)'/g)].map((m) => Number(m[1]));
    const workouts = [...store.matchAll(/condition: 'workout_count_(\d+)'/g)].map((m) => Number(m[1]));
    expect(streaks.length).toBeGreaterThan(0);
    expect(streaks).toEqual([...CHECKIN_STREAK_THRESHOLDS]);
    expect(workouts).toEqual([...WORKOUT_COUNT_THRESHOLDS]);
  });

  it('window constants: 30-day metrics, 14-day shout-outs, 1 day of grace', () => {
    const metricsFn = functionBlock('_leaderboard_metrics_for');
    const milestonesFn = functionBlock('_leaderboard_milestones_for');
    expect(metricsFn).toContain(`p_today - ${METRIC_WINDOW_DAYS - 1}`);
    expect(metricsFn).toContain('p_today + 1');
    expect(metricsFn).toContain('r.run_end >= p_today - 1');
    expect(milestonesFn).toContain(`BETWEEN p_today - ${SHOUTOUT_WINDOW_DAYS - 1} AND p_today + 1`);
    expect(metricsFn).toContain("coalesce(dl.source, 'user') <> 'planned'");
    expect(metricsFn).toContain('least(ps.logged, ps.expected)');
  });

  it('public functions return exactly the allowlisted columns — no health values', () => {
    expect(returnsTableColumns('get_community_leaderboard')).toEqual([...ALLOWED_LEADERBOARD_FIELDS].sort());
    expect(returnsTableColumns('get_community_shoutouts')).toEqual([...ALLOWED_SHOUTOUT_FIELDS].sort());
    expect(returnsTableColumns('get_my_leaderboard_metrics')).toEqual([...ALLOWED_MY_METRICS_FIELDS].sort());
    for (const f of [...ALLOWED_LEADERBOARD_FIELDS, ...ALLOWED_SHOUTOUT_FIELDS]) {
      expect(f).not.toMatch(/email|first_name|last_name|^name$|weight|amount|peptide|compound|note|age_range|birth|phone/);
    }
  });

  it('both community-facing functions gate on the opt-in and honour blocks', () => {
    for (const fn of ['get_community_leaderboard', 'get_community_shoutouts']) {
      const block = functionBlock(fn);
      expect(block).toContain('p.leaderboard_opt_in IS TRUE');
      expect(block).toContain('public.community_blocks');
      expect(block).toMatch(/IF v_uid IS NULL THEN\s+RETURN;/);
      expect(block).toContain('SECURITY DEFINER');
      expect(block).toContain("SET search_path = ''");
    }
  });

  it('every function revokes anon + authenticated BY NAME, not just PUBLIC', () => {
    const fns = [...MIGRATION.matchAll(/CREATE OR REPLACE FUNCTION (public\.[a-z_]+)\(/g)].map((m) => m[1]);
    expect(fns).toHaveLength(6);
    for (const fn of fns) {
      const revoke = new RegExp(`REVOKE ALL ON FUNCTION ${fn.replace('.', '\\.')}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`);
      expect(MIGRATION).toMatch(revoke);
    }
    const granted = [...MIGRATION.matchAll(/GRANT EXECUTE ON FUNCTION (public\.[a-z_]+)\(/g)].map((m) => m[1]).sort();
    expect(granted).toEqual([
      'public.get_community_leaderboard',
      'public.get_community_shoutouts',
      'public.get_my_leaderboard_metrics',
    ]);
    expect(MIGRATION).not.toMatch(/GRANT[^;]*\banon\b/);
  });

  it('the opt-in column defaults to false and is NOT NULL', () => {
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS leaderboard_opt_in BOOLEAN NOT NULL DEFAULT false');
  });
});
