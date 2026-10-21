/**
 * Every user-visible string for the community leaderboard, in one file.
 *
 * Edward read and approved this copy on 2026-09-18. The per-line
 * `// DRAFT — Edward approves` markers, and the test that required them, have
 * been retired now that they have served their purpose.
 *
 * Change the words here and nowhere else; the screens only reference these
 * keys, and `leaderboardPayload.test.ts` still refuses hardcoded text in any of
 * them.
 *
 * Rules the copy follows: short, positive framing (what the feature does),
 * no health values, no compound names, no model names.
 */

import type { LeaderboardMetric, MilestoneKind } from '../lib/leaderboardMetrics';

export const LEADERBOARD_COPY = {
  // ── Onboarding (Create Account step) ────────────────────────────────────
  onboardingLabel: 'Community leaderboard',
  onboardingSub: 'Off by default. Change it any time in Profile.',
  onboardingToggle: 'Show me on the leaderboard',
  onboardingToggleHint: 'Shares your display name, avatar, check-in streak, dose adherence % and workout count.',
  // ── Profile → Public sharing ────────────────────────────────────────────
  settingsTitle: 'Community leaderboard',
  settingsBody: 'Appear on the leaderboard and in shout-outs with your display name and avatar.',
  settingsSaveFailed: "Couldn't save that change. Try again.",
  settingsOpenBoard: 'Open the leaderboard',
  // ── Navigation ─────────────────────────────────────────────────────────
  navLabel: 'Leaderboard',
  navHint: 'Streaks and shout-outs',
  feedEntryA11y: 'Open the community leaderboard',
  // ── Leaderboard screen ─────────────────────────────────────────────────
  screenTitle: 'Leaderboard',
  observationJoined: "You're on the board. Keep it going.",
  observationNotJoined: 'Join the board to share your streaks.',
  yourNumbers: 'Your numbers',
  joinTitle: 'Join the leaderboard',
  joinBody: 'Share your streaks and progress with the community. Leave any time.',
  joinButton: 'Join',
  joinedTitle: "You're on the leaderboard",
  leaveButton: 'Leave',
  boardEmpty: 'This board fills up as members join and log progress.',
  loadFailed: "Couldn't load the leaderboard.",
  retry: 'Tap to retry',
  youBadge: 'You',
  memberFallbackName: 'PepTalk member',
  hideTitle: 'Hide this person?',
  hideBody: "You won't see each other on the leaderboard or in the community.",
  hideConfirm: 'Hide',
  hideCancel: 'Cancel',
  hideFailed: "Couldn't hide that person. Try again.",
  rowA11yHint: 'Long-press to hide this person',
  /**
   * TODO(Edward): a title for the sheet a row's visible "more" control opens —
   * the one offering Report and Hide for that member. There is no existing
   * string for it ('Post actions' in the feed is post-specific), so it is
   * EMPTY and renders nothing: the sheet shows its buttons with no title,
   * which works. Report / Hide / Cancel themselves reuse strings the app
   * already ships.
   */
  rowActionsTitle: '',

  // ── Shout-outs ─────────────────────────────────────────────────────────
  shoutoutsTitle: 'Shout-outs',
  shoutoutsEmpty: 'Member milestones show up here.',
  allMilestones: 'All milestones',
  // ── Milestones screen ──────────────────────────────────────────────────
  milestonesTitle: 'Milestones',
  milestonesObservation: 'Community shout-outs and your own milestones.',
  communityShoutoutsTitle: 'Community shout-outs',
  yourMilestonesTitle: 'Your milestones',
  yourMilestonesEmpty: 'Log check-ins, doses and workouts to earn milestones.',
  // ── Community feed strip ───────────────────────────────────────────────
  stripTitle: 'Leaderboard',
  stripEmpty: 'See who is on a streak',
} as const;

export const METRIC_COPY: Record<LeaderboardMetric, { label: string; hint: string }> = {
  checkin_streak: { label: 'Check-in streak', hint: 'Days in a row' },
  dose_adherence_30d: { label: 'Dose adherence', hint: 'Last 30 days' },
  workouts_30d: { label: 'Workouts', hint: 'Last 30 days' },
};

/** How a metric value reads. */
export function formatMetricValue(metric: LeaderboardMetric, value: number | null): string {
  if (value == null) return '—';
  if (metric === 'checkin_streak') return value === 1 ? '1 day' : `${value} days`;
  if (metric === 'dose_adherence_30d') return `${value}%`;
  return value === 1 ? '1 workout' : `${value} workouts`;
}

/** One shout-out sentence. */
export function shoutoutText(name: string, kind: MilestoneKind, threshold: number): string {
  if (kind === 'checkin_streak') return `${name} hit a ${threshold}-day check-in streak`;
  if (threshold === 1) return `${name} logged their first workout`;
  return `${name} logged ${threshold} workouts`;
}
