/**
 * The report / block strings, as they already ship.
 *
 * Every string below is lifted VERBATIM from the community surfaces that have
 * been live since the feed shipped — app/(tabs)/community/[id].tsx builds the
 * target-agnostic sheet ("Report this content" / "Why are you reporting it?"),
 * and app/(tabs)/community/index.tsx uses the same result alerts. Collected
 * here so the new report surfaces (leaderboard rows, shout-outs, Aimee
 * replies) say what the app already says instead of growing a fourth wording
 * for the same action.
 *
 * Nothing here is new copy and nothing here is a rewrite: the feed screens are
 * untouched and still render their own literals, so what a user sees on the
 * feed today is byte-identical. Edward writes the words — if he changes any of
 * these, the feed literals change with them.
 *
 * NEW copy needed by the new surfaces lives in `AI_REPORT_COPY` below and in
 * `LEADERBOARD_COPY.rowActionsTitle`, both marked TODO(Edward) and rendered as
 * nothing until he writes them.
 */

/** Existing, already-shipping strings. Do not edit without Edward. */
export const REPORT_COPY = {
  /** Button that opens the report flow. app/(tabs)/community/index.tsx */
  report: 'Report',
  /** Sheet title, target-agnostic. app/(tabs)/community/[id].tsx */
  sheetTitle: 'Report this content',
  /** Sheet body, target-agnostic. app/(tabs)/community/[id].tsx */
  sheetBody: 'Why are you reporting it?',
  /** Failure alert title. Both community screens. */
  failedTitle: 'Report failed',
  /** Success alert title + body. Both community screens. */
  doneTitle: 'Reported',
  doneBody: 'Thanks — we read every report.',
  /** Cancel button. Both community screens. */
  cancel: 'Cancel',
} as const;

/**
 * Copy the AI-response report needs and the app does not already have.
 *
 * EMPTY ON PURPOSE. An empty string renders nothing — an Alert with no title
 * shows its buttons, which is a usable sheet — and a placeholder shipped by
 * accident is worse than a missing line. Fill these in and nothing else needs
 * to change.
 */
export const AI_REPORT_COPY = {
  /**
   * TODO(Edward): the accessibility label for the report control on one of
   * Aimee's replies. Until then the control uses REPORT_COPY.report.
   */
  messageActionA11yLabel: '',
  /**
   * TODO(Edward): a title for the AI report sheet, if "Report this content"
   * should read differently when the thing reported is an assistant reply.
   */
  sheetTitle: '',
} as const;

/** The reasons offered, in the order both community screens offer them. */
export const REPORT_REASON_ORDER = [
  'spam',
  'harassment',
  'unsafe_medical_advice',
  'misinformation',
  'off_topic',
  'other',
] as const;
