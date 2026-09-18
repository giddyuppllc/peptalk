/**
 * Leaderboard payload scrub, cache purges, the copy file, and reachability.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_LEADERBOARD_FIELDS,
  ALLOWED_SHOUTOUT_FIELDS,
  purgeSelf,
  purgeUser,
  scrubLeaderboardRow,
  scrubMyMetrics,
  scrubRows,
  scrubShoutoutRow,
  type Boards,
  type LeaderboardRow,
  type ListState,
  type ShoutoutRow,
} from '../leaderboardPayload';
import { ALL_NAV_DESTINATIONS } from '../navMap';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Everything a careless SQL change could add to a row. */
const SENSITIVE = {
  email: 'someone@example.com',
  first_name: 'Private',
  last_name: 'Person',
  weight_lbs: 187.25,
  peptide_id: 'bpc-157',
  peptide_name: 'BPC-157',
  dose_amount: 250,
  amount: 250,
  notes: 'private note',
  age_range: '30-45',
  date_of_birth: '1990-01-01',
  phone: '555',
  subscription_tier: 'pro',
};

const SENSITIVE_VALUES = Object.values(SENSITIVE).map(String);

describe('scrubLeaderboardRow', () => {
  const raw = {
    rank: 1,
    user_id: 'u1',
    username: 'alice',
    display_name: 'Alice',
    avatar_url: 'https://x/a.png',
    metric_value: 12,
    is_self: false,
    ...SENSITIVE,
  };

  it('keeps only the allowlisted fields', () => {
    const row = scrubLeaderboardRow(raw)!;
    expect(Object.keys(row).sort()).toEqual(
      ['rank', 'userId', 'username', 'displayName', 'avatarUrl', 'value', 'isSelf'].sort(),
    );
    const blob = JSON.stringify(row);
    for (const v of SENSITIVE_VALUES) expect(blob).not.toContain(v);
  });

  it('the camelCase output maps 1:1 onto the SQL allowlist', () => {
    expect(ALLOWED_LEADERBOARD_FIELDS).toHaveLength(Object.keys(scrubLeaderboardRow(raw)!).length);
  });

  it('rejects malformed rows rather than guessing', () => {
    expect(scrubLeaderboardRow(null)).toBeNull();
    expect(scrubLeaderboardRow([])).toBeNull();
    expect(scrubLeaderboardRow({ ...raw, user_id: undefined })).toBeNull();
    expect(scrubLeaderboardRow({ ...raw, metric_value: '12' })).toBeNull();
  });

  it('is_self only on a literal true', () => {
    expect(scrubLeaderboardRow({ ...raw, is_self: 'true' })!.isSelf).toBe(false);
    expect(scrubLeaderboardRow({ ...raw, is_self: true })!.isSelf).toBe(true);
  });
});

describe('scrubShoutoutRow', () => {
  const raw = {
    user_id: 'u1',
    username: null,
    display_name: 'Alice',
    avatar_url: null,
    kind: 'checkin_streak',
    threshold: 7,
    achieved_on: '2026-09-15',
    is_self: false,
    ...SENSITIVE,
  };

  it('keeps only the allowlisted fields', () => {
    const row = scrubShoutoutRow(raw)!;
    expect(Object.keys(row)).toHaveLength(ALLOWED_SHOUTOUT_FIELDS.length);
    const blob = JSON.stringify(row);
    for (const v of SENSITIVE_VALUES) expect(blob).not.toContain(v);
  });

  it('drops an unknown milestone kind — a new server kind cannot render unreviewed copy', () => {
    expect(scrubShoutoutRow({ ...raw, kind: 'lab_improvement' })).toBeNull();
    expect(scrubShoutoutRow({ ...raw, kind: 'cycle_complete' })).toBeNull();
  });
});

describe('scrubMyMetrics / scrubRows', () => {
  it('keeps only the three counts', () => {
    const m = scrubMyMetrics([{ checkin_streak: 4, dose_adherence_30d: null, workouts_30d: 2, ...SENSITIVE }]);
    expect(m).toEqual({ checkin_streak: 4, dose_adherence_30d: null, workouts_30d: 2 });
  });

  it('a non-array payload is an empty list, and bad rows are dropped', () => {
    expect(scrubRows({ rows: [] }, scrubLeaderboardRow)).toEqual([]);
    expect(scrubRows([{ user_id: 'x' }, { rank: 1, user_id: 'y', metric_value: 3 }], scrubLeaderboardRow)).toHaveLength(1);
  });
});

describe('opt-out and hide purge cached rows immediately', () => {
  const row = (userId: string, isSelf = false): LeaderboardRow => ({
    rank: 1, userId, username: null, displayName: userId, avatarUrl: null, value: 5, isSelf,
  });
  const shout = (userId: string, isSelf = false): ShoutoutRow => ({
    userId, username: null, displayName: userId, avatarUrl: null, kind: 'checkin_streak', threshold: 7, achievedOn: '2026-09-15', isSelf,
  });
  const boards = (): Boards => ({
    checkin_streak: { rows: [row('me', true), row('a')], status: 'ready' },
    dose_adherence_30d: { rows: [row('a'), row('me', true)], status: 'ready' },
    workouts_30d: { rows: [row('me', true)], status: 'ready' },
  });
  const shouts = (): ListState<ShoutoutRow> => ({ rows: [shout('me', true), shout('a')], status: 'ready' });

  it('purgeSelf removes the viewer from every board and the shout-outs', () => {
    const next = purgeSelf(boards(), shouts());
    for (const b of Object.values(next.boards)) expect(b.rows.some((r) => r.isSelf)).toBe(false);
    expect(next.shoutouts.rows.map((r) => r.userId)).toEqual(['a']);
    expect(next.boards.checkin_streak.rows.map((r) => r.userId)).toEqual(['a']);
  });

  it('purgeUser removes a hidden person everywhere and keeps everyone else', () => {
    const next = purgeUser(boards(), shouts(), 'a');
    for (const b of Object.values(next.boards)) expect(b.rows.some((r) => r.userId === 'a')).toBe(false);
    expect(next.shoutouts.rows.map((r) => r.userId)).toEqual(['me']);
  });
});

describe('copy lives in one file, every string marked DRAFT', () => {
  const copy = read('src', 'constants', 'leaderboardCopy.ts');

  it('every line carrying a string literal is marked // DRAFT — Edward approves', () => {
    const code = copy
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.trim().startsWith('//'))
      .filter((l) => !/^\s*import /.test(l));
    const withStrings = code.filter((l) => /(['"`])[^'"`]*[A-Za-z—][^'"`]*\1/.test(l.replace(/\/\/.*$/, '')));
    expect(withStrings.length).toBeGreaterThan(40);
    const unmarked = withStrings.filter(
      (l) => !l.includes('// DRAFT — Edward approves') && !/metric === '|kind === '|value === 1|threshold === 1/.test(l.replace(/\/\/.*$/, '').replace(/return .*/, '')),
    );
    expect(unmarked).toEqual([]);
  });

  it.each([
    'app/community/leaderboard.tsx',
    'app/community/milestones.tsx',
    'src/components/LeaderboardStrip.tsx',
    'src/components/community/LeaderboardParts.tsx',
  ])('%s has no hardcoded JSX text', (file) => {
    const src = read(...file.split('/'));
    // text directly between JSX tags, e.g. <Text>Join</Text>
    const literals = [...src.matchAll(/>\s*([A-Za-z][A-Za-z ,.'’!?-]{2,})\s*</g)].map((m) => m[1]);
    expect(literals).toEqual([]);
    expect(src).toContain('leaderboardCopy');
  });

  it('the strip carries no mock roster', () => {
    const strip = read('src', 'components', 'LeaderboardStrip.tsx');
    expect(strip).not.toMatch(/MOCK_USERS|Sarah K\.|weeklyXP/);
  });

  it('no orange accents or gradients in the new leaderboard UI', () => {
    for (const f of [
      ['app', 'community', 'leaderboard.tsx'],
      ['app', 'community', 'milestones.tsx'],
      ['src', 'components', 'LeaderboardStrip.tsx'],
      ['src', 'components', 'community', 'LeaderboardParts.tsx'],
    ]) {
      const src = read(...f);
      expect(src).not.toMatch(/accentCognac|LinearGradient|#CD7F32|#E89672|rgba\(201,136,90/);
    }
  });
});

describe('the leaderboard is reachable', () => {
  it('has a nav sheet entry that resolves to the screen file', () => {
    const entry = ALL_NAV_DESTINATIONS.find((d) => d.href === '/community/leaderboard');
    expect(entry).toBeDefined();
    expect(fs.existsSync(path.join(ROOT, 'app', 'community', 'leaderboard.tsx'))).toBe(true);
  });

  it('the community feed links to it (header button + strip mounted)', () => {
    const feed = read('app', '(tabs)', 'community', 'index.tsx');
    expect(feed).toContain("router.push('/community/leaderboard'");
    expect(feed).toContain('<LeaderboardStrip />');
  });

  it('milestones is reachable from the leaderboard, and back', () => {
    expect(read('app', 'community', 'leaderboard.tsx')).toContain("'/community/milestones'");
    expect(read('app', 'community', 'milestones.tsx')).toContain("'/community/leaderboard'");
  });

  it('Aimee advertises and resolves community-leaderboard, consistent with navMap', () => {
    const tools = read('supabase', 'functions', 'aimee-chat-stream', '_tools.ts');
    expect(tools).toContain("'community-leaderboard': '/community/leaderboard'");
    expect(tools).toMatch(/'"community-leaderboard", "community-milestones",'/);
  });

  it('the stale "deliberately unlaunched" allowlist entries are gone', () => {
    expect(read('scripts', 'verify-route-reachability.ts')).not.toContain("'community/leaderboard',");
    expect(read('scripts', 'verify-dead-files.mjs')).not.toContain("'src/components/LeaderboardStrip.tsx',");
  });

  it('onboarding offers the opt-in, default off, and Settings can change it', () => {
    const onboarding = read('app', 'onboarding.tsx');
    expect(onboarding).toMatch(/const \[leaderboardOptIn, setLeaderboardOptIn\] = useState\(false\)/);
    // The account it was answered for travels with the choice — a held opt-in
    // must not be applied to whoever signs in next on this install.
    expect(onboarding).toContain('recordOnboardingChoice(leaderboardOptIn, optInAccount)');
    const prefs = read('app', 'profile', 'community-prefs.tsx');
    expect(prefs).toContain('setLeaderboardOptIn(v)');
  });
});
