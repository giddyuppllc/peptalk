/**
 * The report payload allowlist.
 *
 * These pin the two things that were wrong before: a report could not name a
 * member at all, and there was no single place deciding what a report is
 * allowed to carry. Assertions are on the OUTCOME — the exact body that goes
 * on the wire — not on whether a function was called.
 */

import {
  buildReportBody,
  targetKindOf,
  canModerateMemberRow,
  REPORT_BODY_KEYS,
  AI_MESSAGE_MAX,
  type CommunityReportBody,
} from '../reportTargets';

describe('buildReportBody — target types', () => {
  it('records a post report as a post', () => {
    const r = buildReportBody({ kind: 'post', postId: 'p1' }, 'spam');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toEqual({ postId: 'p1', reason: 'spam' });
    expect(targetKindOf(r.body)).toBe('post');
  });

  it('records a comment report as a comment', () => {
    const r = buildReportBody({ kind: 'comment', commentId: 'c1' }, 'harassment');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toEqual({ commentId: 'c1', reason: 'harassment' });
    expect(targetKindOf(r.body)).toBe('comment');
  });

  // The gap this work exists to close: a member on the leaderboard.
  it('records a member report as a user, under reportedUserId', () => {
    const r = buildReportBody({ kind: 'user', userId: 'u-42' }, 'harassment');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toEqual({ reportedUserId: 'u-42', reason: 'harassment' });
    expect(targetKindOf(r.body)).toBe('user');
    // Must NOT be smuggled in as a post or a comment.
    expect(r.body.postId).toBeUndefined();
    expect(r.body.commentId).toBeUndefined();
  });

  it('records an AI report as an ai_message, with the text and time', () => {
    const r = buildReportBody(
      { kind: 'ai_message', text: 'take 40mg', at: '2026-09-16T10:00:00.000Z' },
      'unsafe_medical_advice',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(targetKindOf(r.body)).toBe('ai_message');
    expect(r.body.aiMessageText).toBe('take 40mg');
    expect(r.body.aiMessageAt).toBe('2026-09-16T10:00:00.000Z');
  });

  it('names exactly one target for every kind', () => {
    const targets = [
      { kind: 'post', postId: 'p' },
      { kind: 'comment', commentId: 'c' },
      { kind: 'user', userId: 'u' },
      { kind: 'ai_message', text: 'x', at: '2026-09-16T10:00:00.000Z' },
    ] as const;
    for (const t of targets) {
      const r = buildReportBody(t, 'other');
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(targetKindOf(r.body)).not.toBeNull();
      const set = [r.body.postId, r.body.commentId, r.body.reportedUserId, r.body.aiMessageText]
        .filter((v) => v != null);
      expect(set).toHaveLength(1);
    }
  });
});

describe('buildReportBody — refusals', () => {
  it.each([
    ['post', { kind: 'post', postId: '' }],
    ['post (whitespace)', { kind: 'post', postId: '   ' }],
    ['comment', { kind: 'comment', commentId: '' }],
    ['user', { kind: 'user', userId: '' }],
    ['ai_message', { kind: 'ai_message', text: '   ', at: '2026-09-16T10:00:00.000Z' }],
  ])('refuses an empty %s target rather than sending a body with no target', (_label, target) => {
    const r = buildReportBody(target as never, 'spam');
    expect(r.ok).toBe(false);
  });

  it('refuses an unknown reason', () => {
    const r = buildReportBody({ kind: 'user', userId: 'u' }, 'not_a_reason' as never);
    expect(r.ok).toBe(false);
  });

  it('refuses an unknown target kind', () => {
    const r = buildReportBody({ kind: 'nope' } as never, 'spam');
    expect(r.ok).toBe(false);
  });

  // Object.prototype keys must not read as valid reasons.
  it.each(['constructor', 'toString', '__proto__'])('refuses the inherited key %s as a reason', (key) => {
    expect(buildReportBody({ kind: 'user', userId: 'u' }, key as never).ok).toBe(false);
  });
});

describe('buildReportBody — nothing beyond the allowlist', () => {
  it('emits only keys the edge function accepts', () => {
    const targets = [
      { kind: 'post', postId: 'p' },
      { kind: 'comment', commentId: 'c' },
      { kind: 'user', userId: 'u' },
      { kind: 'ai_message', text: 'hello', at: '2026-09-16T10:00:00.000Z' },
    ] as const;
    for (const t of targets) {
      const r = buildReportBody(t, 'other', 'a note');
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      for (const k of Object.keys(r.body)) {
        expect(REPORT_BODY_KEYS).toContain(k as keyof CommunityReportBody);
      }
    }
  });

  it('drops an unparseable AI timestamp instead of sending it', () => {
    const r = buildReportBody({ kind: 'ai_message', text: 'hi', at: 'not a date' }, 'other');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.aiMessageAt).toBeUndefined();
    expect(r.body.aiMessageText).toBe('hi');
  });

  it('truncates AI text to the column length so the insert cannot be refused', () => {
    const long = 'x'.repeat(AI_MESSAGE_MAX + 500);
    const r = buildReportBody({ kind: 'ai_message', text: long, at: '' }, 'other');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.aiMessageText).toHaveLength(AI_MESSAGE_MAX);
  });

  it('omits notes entirely when blank, and trims + caps them when given', () => {
    const blank = buildReportBody({ kind: 'user', userId: 'u' }, 'other', '   ');
    expect(blank.ok).toBe(true);
    if (blank.ok) expect('notes' in blank.body).toBe(false);

    const long = buildReportBody({ kind: 'user', userId: 'u' }, 'other', `  ${'n'.repeat(900)}  `);
    expect(long.ok).toBe(true);
    if (long.ok) expect(long.body.notes).toHaveLength(500);
  });
});

describe('canModerateMemberRow — whether a row gets a control at all', () => {
  it('offers the control on another member', () => {
    expect(canModerateMemberRow({ isSelf: false })).toBe(true);
    expect(canModerateMemberRow({})).toBe(true);
  });

  it('withholds it on your own row — you cannot report or hide yourself', () => {
    expect(canModerateMemberRow({ isSelf: true })).toBe(false);
  });

  it('withholds it when there is no row', () => {
    expect(canModerateMemberRow(null)).toBe(false);
    expect(canModerateMemberRow(undefined)).toBe(false);
  });
});

describe('targetKindOf', () => {
  it('returns null when a body names no target or more than one', () => {
    expect(targetKindOf({ reason: 'spam' })).toBeNull();
    expect(targetKindOf({ reason: 'spam', postId: 'p', reportedUserId: 'u' })).toBeNull();
  });
});
