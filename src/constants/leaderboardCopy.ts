/**
 * Every user-visible string for the community leaderboard, in one file.
 *
 * ALL OF THESE ARE DRAFTS. Edward writes the words — each line is marked
 * `// DRAFT — Edward approves` until he has read it. Change the words here and
 * nowhere else; the screens only reference these keys.
 *
 * Rules the drafts follow: short, positive framing (what the feature does),
 * no health values, no compound names, no model names.
 */

import type { LeaderboardMetric, MilestoneKind } from '../lib/leaderboardMetrics';

export const LEADERBOARD_COPY = {
  // ── Onboarding (Create Account step) ────────────────────────────────────
  onboardingLabel: 'Community leaderboard', // DRAFT — Edward approves
  onboardingSub: 'Off by default. Change it any time in Profile.', // DRAFT — Edward approves
  onboardingToggle: 'Show me on the leaderboard', // DRAFT — Edward approves
  onboardingToggleHint: 'Shares your display name, avatar, check-in streak, dose adherence % and workout count.', // DRAFT — Edward approves

  // ── Profile → Public sharing ────────────────────────────────────────────
  settingsTitle: 'Community leaderboard', // DRAFT — Edward approves
  settingsBody: 'Appear on the leaderboard and in shout-outs with your display name and avatar.', // DRAFT — Edward approves
  settingsSaveFailed: "Couldn't save that change. Try again.", // DRAFT — Edward approves
  settingsOpenBoard: 'Open the leaderboard', // DRAFT — Edward approves

  // ── Navigation ─────────────────────────────────────────────────────────
  navLabel: 'Leaderboard', // DRAFT — Edward approves
  navHint: 'Streaks and shout-outs', // DRAFT — Edward approves
  feedEntryA11y: 'Open the community leaderboard', // DRAFT — Edward approves

  // ── Leaderboard screen ─────────────────────────────────────────────────
  screenTitle: 'Leaderboard', // DRAFT — Edward approves
  observationJoined: "You're on the board. Keep it going.", // DRAFT — Edward approves
  observationNotJoined: 'Join the board to share your streaks.', // DRAFT — Edward approves
  yourNumbers: 'Your numbers', // DRAFT — Edward approves
  joinTitle: 'Join the leaderboard', // DRAFT — Edward approves
  joinBody: 'Share your streaks and progress with the community. Leave any time.', // DRAFT — Edward approves
  joinButton: 'Join', // DRAFT — Edward approves
  joinedTitle: "You're on the leaderboard", // DRAFT — Edward approves
  leaveButton: 'Leave', // DRAFT — Edward approves
  boardEmpty: 'This board fills up as members join and log progress.', // DRAFT — Edward approves
  loadFailed: "Couldn't load the leaderboard.", // DRAFT — Edward approves
  retry: 'Tap to retry', // DRAFT — Edward approves
  youBadge: 'You', // DRAFT — Edward approves
  memberFallbackName: 'PepTalk member', // DRAFT — Edward approves
  hideTitle: 'Hide this person?', // DRAFT — Edward approves
  hideBody: "You won't see each other on the leaderboard or in the community.", // DRAFT — Edward approves
  hideConfirm: 'Hide', // DRAFT — Edward approves
  hideCancel: 'Cancel', // DRAFT — Edward approves
  hideFailed: "Couldn't hide that person. Try again.", // DRAFT — Edward approves
  rowA11yHint: 'Long-press to hide this person', // DRAFT — Edward approves
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
  shoutoutsTitle: 'Shout-outs', // DRAFT — Edward approves
  shoutoutsEmpty: 'Member milestones show up here.', // DRAFT — Edward approves
  allMilestones: 'All milestones', // DRAFT — Edward approves

  // ── Milestones screen ──────────────────────────────────────────────────
  milestonesTitle: 'Milestones', // DRAFT — Edward approves
  milestonesObservation: 'Community shout-outs and your own milestones.', // DRAFT — Edward approves
  communityShoutoutsTitle: 'Community shout-outs', // DRAFT — Edward approves
  yourMilestonesTitle: 'Your milestones', // DRAFT — Edward approves
  yourMilestonesEmpty: 'Log check-ins, doses and workouts to earn milestones.', // DRAFT — Edward approves

  // ── Community feed strip ───────────────────────────────────────────────
  stripTitle: 'Leaderboard', // DRAFT — Edward approves
  stripEmpty: 'See who is on a streak', // DRAFT — Edward approves
} as const;

export const METRIC_COPY: Record<LeaderboardMetric, { label: string; hint: string }> = {
  checkin_streak: { label: 'Check-in streak', hint: 'Days in a row' }, // DRAFT — Edward approves
  dose_adherence_30d: { label: 'Dose adherence', hint: 'Last 30 days' }, // DRAFT — Edward approves
  workouts_30d: { label: 'Workouts', hint: 'Last 30 days' }, // DRAFT — Edward approves
};

/** How a metric value reads. */
export function formatMetricValue(metric: LeaderboardMetric, value: number | null): string {
  if (value == null) return '—'; // DRAFT — Edward approves
  if (metric === 'checkin_streak') return value === 1 ? '1 day' : `${value} days`; // DRAFT — Edward approves
  if (metric === 'dose_adherence_30d') return `${value}%`; // DRAFT — Edward approves
  return value === 1 ? '1 workout' : `${value} workouts`; // DRAFT — Edward approves
}

/** One shout-out sentence. */
export function shoutoutText(name: string, kind: MilestoneKind, threshold: number): string {
  if (kind === 'checkin_streak') return `${name} hit a ${threshold}-day check-in streak`; // DRAFT — Edward approves
  if (threshold === 1) return `${name} logged their first workout`; // DRAFT — Edward approves
  return `${name} logged ${threshold} workouts`; // DRAFT — Edward approves
}
