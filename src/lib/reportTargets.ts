/**
 * What a report is *about* — and the only shape the client is allowed to send.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 * `community-report` used to take exactly two things: a postId or a commentId.
 * Two surfaces had no way to use it at all:
 *
 *   - the leaderboard and shout-outs, which show another member's display name,
 *     avatar and progress metrics to every signed-in user. The only control was
 *     a long-press that blocked them, discoverable through `accessibilityHint`
 *     alone, and `reportContent` could not name a person even if a button had
 *     existed. App Review 1.2 wants reporting on a surface like that.
 *
 *   - Aimee's replies. Google Play's generative-AI policy wants an in-app way
 *     to flag an offensive or unsafe AI response. Chat is client-side, so there
 *     is no row id to send; the message text and its timestamp are the report.
 *
 * The body is built HERE, by an allowlist, rather than spread at each call
 * site, so there is one place to prove that a report carries the target and
 * nothing else. That matters most for the AI case: a ChatMessage also holds
 * `journalEntry`, `toolResults` and `pendingActions`, which can contain doses,
 * weights and meals. A report must not become a side channel for health data
 * that the user may have explicitly refused to send to the cloud.
 *
 * Pure, RN-free, unit-tested. The server re-validates all of this — neither
 * side can widen the payload on its own.
 */

import type { CommunityReportReason } from '../types/community';
import { REPORT_REASON_LABELS } from '../types/community';

/** Matches the length CHECK on community_reports.ai_message_text. */
export const AI_MESSAGE_MAX = 4000;

export type CommunityReportTargetKind = 'post' | 'comment' | 'user' | 'ai_message';

export type CommunityReportTarget =
  | { kind: 'post'; postId: string }
  | { kind: 'comment'; commentId: string }
  | { kind: 'user'; userId: string }
  | { kind: 'ai_message'; text: string; at: string };

/**
 * The complete set of fields `community-report` accepts. Anything not listed
 * here never reaches the wire, because buildReportBody constructs the object
 * field by field rather than spreading an input.
 */
export interface CommunityReportBody {
  postId?: string;
  commentId?: string;
  reportedUserId?: string;
  aiMessageText?: string;
  aiMessageAt?: string;
  reason: CommunityReportReason;
  notes?: string;
}

export const REPORT_BODY_KEYS: readonly (keyof CommunityReportBody)[] = [
  'postId',
  'commentId',
  'reportedUserId',
  'aiMessageText',
  'aiMessageAt',
  'reason',
  'notes',
];

export type BuildResult =
  | { ok: true; body: CommunityReportBody }
  | { ok: false; error: string };

function isReason(value: unknown): value is CommunityReportReason {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REPORT_REASON_LABELS, value);
}

/**
 * Turn a target + reason into the request body, or refuse.
 *
 * Refusing is not cosmetic. An empty id would serialise to `undefined`, the
 * server would see zero targets, and the user would be told the report failed
 * for no stated reason — the "200 OK and nothing happened" shape this codebase
 * keeps hitting. Fail here, where the caller can say so.
 */
export function buildReportBody(
  target: CommunityReportTarget,
  reason: CommunityReportReason,
  notes?: string,
): BuildResult {
  if (!isReason(reason)) return { ok: false, error: 'Unknown report reason.' };

  const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : '';
  const tail = trimmedNotes.length > 0 ? { reason, notes: trimmedNotes } : { reason };

  switch (target?.kind) {
    case 'post': {
      const id = target.postId?.trim() ?? '';
      if (!id) return { ok: false, error: 'Missing post to report.' };
      return { ok: true, body: { postId: id, ...tail } };
    }
    case 'comment': {
      const id = target.commentId?.trim() ?? '';
      if (!id) return { ok: false, error: 'Missing comment to report.' };
      return { ok: true, body: { commentId: id, ...tail } };
    }
    case 'user': {
      const id = target.userId?.trim() ?? '';
      if (!id) return { ok: false, error: 'Missing member to report.' };
      return { ok: true, body: { reportedUserId: id, ...tail } };
    }
    case 'ai_message': {
      const text = target.text?.trim() ?? '';
      if (!text) return { ok: false, error: 'Nothing to report — that message is empty.' };
      const body: CommunityReportBody = { aiMessageText: text.slice(0, AI_MESSAGE_MAX), ...tail };
      // An unparseable timestamp is dropped, not sent: the server would ignore
      // it anyway, and a report without a time is still a usable report.
      const at = typeof target.at === 'string' ? Date.parse(target.at) : NaN;
      if (!Number.isNaN(at)) body.aiMessageAt = new Date(at).toISOString();
      return { ok: true, body };
    }
    default:
      return { ok: false, error: 'Nothing to report.' };
  }
}

/**
 * Whether a row on the leaderboard or in the shout-outs may be reported or
 * hidden — i.e. whether its moderation control renders at all.
 *
 * You cannot report or hide yourself. The server enforces the same rule
 * (community_reports_no_self_report), so this is the UI half of a guard that
 * exists on both sides rather than a client-only courtesy. A row that is not
 * marked `isSelf` is somebody else, and is always actionable.
 */
export function canModerateMemberRow(row: { isSelf?: boolean } | null | undefined): boolean {
  if (!row) return false;
  return row.isSelf !== true;
}

/**
 * Which target a built body names. Used by tests and by anything that wants to
 * describe a report without re-deriving the rules.
 */
export function targetKindOf(body: CommunityReportBody): CommunityReportTargetKind | null {
  const kinds: CommunityReportTargetKind[] = [];
  if (body.postId) kinds.push('post');
  if (body.commentId) kinds.push('comment');
  if (body.reportedUserId) kinds.push('user');
  if (body.aiMessageText) kinds.push('ai_message');
  return kinds.length === 1 ? kinds[0] : null;
}
