/**
 * The Report / Hide sheet behind a leaderboard row's visible control.
 *
 * Shared by app/community/leaderboard.tsx and app/community/milestones.tsx so
 * a member is offered the same two choices wherever their name appears, and so
 * there is one place the wording comes from.
 *
 * WHY THIS EXISTS AT ALL
 * The board shows another member's display name, avatar and progress metrics to
 * every signed-in user. Until now the only thing anyone could do about a row
 * was long-press it to hide the person, and the long-press was announced only
 * through `accessibilityHint` — so to a sighted user tapping around, there was
 * no control there at all, and reporting a member was impossible in any case:
 * the report function took a postId or a commentId and nothing else.
 *
 * Reporting and hiding stay separate actions, as they are in the feed. Hiding
 * is private and immediate; reporting reaches a human and deliberately does
 * NOT hide the person, because choosing to flag someone is not the same as
 * choosing never to see them.
 *
 * All strings are ones the app already ships (src/constants/reportCopy.ts),
 * except LEADERBOARD_COPY.rowActionsTitle, which is an empty TODO(Edward).
 */

import { Alert } from '../../lib/alert';
import { LEADERBOARD_COPY } from '../../constants/leaderboardCopy';
import { REPORT_COPY, REPORT_REASON_ORDER } from '../../constants/reportCopy';
import { REPORT_REASON_LABELS, type CommunityReportReason } from '../../types/community';

type Result = { ok: true } | { ok: false; error: string };

export interface MemberActionHandlers {
  /** Block (symmetric) — the member leaves the board immediately. */
  hideUser: (userId: string) => Promise<Result>;
  /** Flag the member. Does not hide them. */
  reportUser: (userId: string, reason: CommunityReportReason) => Promise<Result>;
}

/** The reason picker, shared by every report surface. */
export function promptReportReasons(
  submit: (reason: CommunityReportReason) => Promise<Result>,
  title: string = REPORT_COPY.sheetTitle,
  body: string = REPORT_COPY.sheetBody,
): void {
  const buttons = REPORT_REASON_ORDER.map((r) => ({
    text: REPORT_REASON_LABELS[r],
    onPress: async () => {
      const res = await submit(r);
      if (!res.ok) Alert.alert(REPORT_COPY.failedTitle, res.error);
      else Alert.alert(REPORT_COPY.doneTitle, REPORT_COPY.doneBody);
    },
  }));
  Alert.alert(title, body, [...buttons, { text: REPORT_COPY.cancel, style: 'cancel' }]);
}

/** Report / Hide / Cancel for one member. */
export function promptMemberActions(
  userId: string,
  name: string,
  handlers: MemberActionHandlers,
): void {
  Alert.alert(LEADERBOARD_COPY.rowActionsTitle, name, [
    {
      text: REPORT_COPY.report,
      onPress: () => promptReportReasons((reason) => handlers.reportUser(userId, reason)),
    },
    {
      text: LEADERBOARD_COPY.hideConfirm,
      style: 'destructive',
      onPress: () =>
        Alert.alert(LEADERBOARD_COPY.hideTitle, `${name}\n\n${LEADERBOARD_COPY.hideBody}`, [
          { text: LEADERBOARD_COPY.hideCancel, style: 'cancel' },
          {
            text: LEADERBOARD_COPY.hideConfirm,
            style: 'destructive',
            onPress: async () => {
              const res = await handlers.hideUser(userId);
              if (!res.ok) Alert.alert(LEADERBOARD_COPY.hideTitle, LEADERBOARD_COPY.hideFailed);
            },
          },
        ]),
    },
    { text: LEADERBOARD_COPY.hideCancel, style: 'cancel' },
  ]);
}
