/**
 * Reporting and hiding a member from the leaderboard.
 *
 * Before this, the board had exactly one control — a long-press that blocked
 * the person, announced only through `accessibilityHint` — and
 * `reportContent` took a postId or a commentId, so a member who appeared on
 * the board could not be reported at all.
 *
 * WHERE THE SEAM IS, AND WHY
 * These run the REAL useLeaderboardStore against the real useCommunityStore
 * with its two network actions replaced by recorders. It stops one step short
 * of the wire because `authedFetch` reaches Supabase through
 * `await import('../services/supabase')`, and babel-preset-expo leaves that as
 * a native dynamic import under jest ("A dynamic import callback was invoked
 * without --experimental-vm-modules"). Making it reachable means changing the
 * shared babel config, which is not worth it for this.
 *
 * What that does and does not prove: the body recorded here is the object
 * `reportContent` hands straight to `authedFetch('community-report', input)`
 * — one pass-through line, and now typed as CommunityReportBody so tsc refuses
 * a body of any other shape. The payload RULES are pinned separately and
 * exhaustively in src/lib/__tests__/reportTargets.test.ts.
 *
 * The block case asserts the row is gone SYNCHRONOUSLY once the call resolves,
 * not after a refetch. A member who blocks someone and still sees them has not
 * been given what the button promised.
 */

// The jest.mock call below is hoisted above these imports by babel-jest, so the
// leaderboard store's persist middleware never reaches expo-secure-store.
import { useLeaderboardStore } from '../useLeaderboardStore';
import { useCommunityStore } from '../useCommunityStore';
import { targetKindOf, type CommunityReportBody } from '../../lib/reportTargets';
import { buildAiMessageReport } from '../../lib/aiReport';

jest.mock('../../services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

type Result = { ok: true } | { ok: false; error: string };

const reported: CommunityReportBody[] = [];
const blocked: string[] = [];
let reportResult: Result = { ok: true };
let blockResult: Result = { ok: true };

const row = (userId: string, rank: number) => ({
  rank,
  userId,
  username: `u${rank}`,
  displayName: `Member ${rank}`,
  avatarUrl: null,
  value: 10 - rank,
  isSelf: false,
});

const shout = (userId: string) => ({
  userId,
  username: 'u',
  displayName: 'Member',
  avatarUrl: null,
  kind: 'checkin_streak' as const,
  threshold: 7,
  achievedOn: '2026-09-10',
  isSelf: false,
});

beforeEach(() => {
  reported.length = 0;
  blocked.length = 0;
  reportResult = { ok: true };
  blockResult = { ok: true };

  useLeaderboardStore.setState({
    boards: {
      checkin_streak: { rows: [row('them', 1), row('other', 2)], status: 'ready' },
      dose_adherence_30d: { rows: [row('them', 1)], status: 'ready' },
      workouts_30d: { rows: [], status: 'idle' },
    },
    shoutouts: { rows: [shout('them'), shout('other')], status: 'ready' },
  });

  useCommunityStore.setState({
    blockedUserIds: [],
    posts: [],
    reportContent: async (input) => {
      reported.push(input);
      return reportResult;
    },
    blockUser: async (userId: string) => {
      blocked.push(userId);
      if (blockResult.ok) {
        useCommunityStore.setState({
          blockedUserIds: Array.from(new Set([...useCommunityStore.getState().blockedUserIds, userId])),
        });
      }
      return blockResult;
    },
  });
});

describe('reportUser', () => {
  it('records the report against the member, as a user target', async () => {
    const res = await useLeaderboardStore.getState().reportUser('them', 'harassment');
    expect(res.ok).toBe(true);

    expect(reported).toHaveLength(1);
    const body = reported[0];
    expect(body.reportedUserId).toBe('them');
    expect(body.reason).toBe('harassment');
    expect(targetKindOf(body)).toBe('user');
    // A person must not be squeezed through the old post/comment shape.
    expect(body.postId).toBeUndefined();
    expect(body.commentId).toBeUndefined();
    expect(body.aiMessageText).toBeUndefined();
  });

  it('does NOT hide the member — reporting and blocking stay separate choices', async () => {
    await useLeaderboardStore.getState().reportUser('them', 'spam');
    expect(blocked).toHaveLength(0);
    expect(useCommunityStore.getState().blockedUserIds).not.toContain('them');
    expect(useLeaderboardStore.getState().boards.checkin_streak.rows.map((r) => r.userId))
      .toContain('them');
  });

  it('sends nothing at all when there is no member id', async () => {
    const res = await useLeaderboardStore.getState().reportUser('   ', 'spam');
    expect(res.ok).toBe(false);
    expect(reported).toHaveLength(0);
  });

  it('sends nothing at all for an unknown reason', async () => {
    const res = await useLeaderboardStore.getState().reportUser('them', 'nope' as never);
    expect(res.ok).toBe(false);
    expect(reported).toHaveLength(0);
  });

  it('surfaces a server refusal rather than reporting success', async () => {
    reportResult = { ok: false, error: 'nope' };
    const res = await useLeaderboardStore.getState().reportUser('them', 'spam');
    expect(res.ok).toBe(false);
  });
});

describe('hideUser', () => {
  it('drops the member from every board and every shout-out immediately', async () => {
    const res = await useLeaderboardStore.getState().hideUser('them');
    expect(res.ok).toBe(true);
    expect(blocked).toEqual(['them']);

    const s = useLeaderboardStore.getState();
    for (const metric of ['checkin_streak', 'dose_adherence_30d', 'workouts_30d'] as const) {
      expect(s.boards[metric].rows.map((r) => r.userId)).not.toContain('them');
    }
    expect(s.shoutouts.rows.map((r) => r.userId)).not.toContain('them');
    expect(useCommunityStore.getState().blockedUserIds).toContain('them');

    // Positive control: the rows did not simply vanish wholesale.
    expect(s.boards.checkin_streak.rows.map((r) => r.userId)).toContain('other');
    expect(s.shoutouts.rows.map((r) => r.userId)).toContain('other');
  });

  it('leaves the board alone when the block fails', async () => {
    blockResult = { ok: false, error: 'offline' };
    const res = await useLeaderboardStore.getState().hideUser('them');
    expect(res.ok).toBe(false);
    expect(useLeaderboardStore.getState().boards.checkin_streak.rows.map((r) => r.userId))
      .toContain('them');
    expect(useLeaderboardStore.getState().shoutouts.rows.map((r) => r.userId)).toContain('them');
  });
});

describe('an AI reply goes through the same report path', () => {
  it('reaches reportContent as an ai_message, with no other target', async () => {
    const built = buildAiMessageReport(
      { role: 'bot', content: 'Take 40mg daily.', timestamp: '2026-09-16T10:00:00.000Z' },
      'unsafe_medical_advice',
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const res = await useCommunityStore.getState().reportContent(built.body);
    expect(res.ok).toBe(true);

    expect(reported).toHaveLength(1);
    const body = reported[0];
    expect(targetKindOf(body)).toBe('ai_message');
    expect(body.aiMessageText).toBe('Take 40mg daily.');
    expect(body.aiMessageAt).toBe('2026-09-16T10:00:00.000Z');
    expect(body.postId).toBeUndefined();
    expect(body.commentId).toBeUndefined();
    expect(body.reportedUserId).toBeUndefined();
  });
});
