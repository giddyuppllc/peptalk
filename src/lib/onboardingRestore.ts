/**
 * Restoring onboarding answers from the server — the pure decision.
 *
 * WHY THIS EXISTS
 * `useOnboardingStore` persisted only to the device. A returning user on a new
 * phone, after a reinstall, or on a fresh PWA load arrived with an empty store
 * and had to answer everything again, even though most of the answers were
 * sitting in `health_profiles.profile` the whole time. Sex, age and goals were
 * never written anywhere server-side at all.
 *
 * THE INVARIANT — two App Store 2.1(a) rejections came from breaking it
 *   - auth may RESPECT onboarding completion; it must never GRANT it for
 *     signing in (src/lib/__tests__/onboardingCompletionGate.test.ts);
 *   - `isComplete` and `isAuthenticated` must never disagree because of a
 *     caller (src/lib/routeGuard.ts);
 *   - a fresh sign-up with an empty profile still goes through onboarding.
 *
 * Restoring completion here RESPECTS it: completion is granted only on the
 * server's record that the final onboarding step succeeded (`completedAt`),
 * together with every answer the onboarding screen itself requires. A session
 * alone restores nothing. A failed or timed-out fetch restores nothing.
 *
 * WHAT "REQUIRED" MEANS — taken from app/onboarding.tsx `canContinue`, not
 * invented. The drift test in onboardingCompletionGate.test.ts fails if that
 * condition changes without this file following it.
 *   step 1 About you  gender, age (stored as the age bucket), at least one goal
 *   step 2 Basics     weight (50-1000 lb) and height (3-8 ft, 0-11 in)
 *   step 3 Finish     the medical disclaimer toggle. It is stored nowhere, so
 *                     the evidence it was accepted is `completedAt`, which is
 *                     written only once the final step has succeeded.
 *
 * Kept free of React Native and of the stores so every branch is unit-tested.
 */

import type {
  AgeRange,
  BodyMetrics,
  Gender,
  GoalType,
  OnboardingProfile,
  OnboardingSnapshot,
} from '../types';
import { GOAL_OPTIONS } from '../constants/goals';

export const ONBOARDING_SNAPSHOT_VERSION = 1;

/** Budget for the whole restore (store hydration + profile fetch). */
export const ONBOARDING_RESTORE_TIMEOUT_MS = 6_000;

// Records keyed by the union so adding a Gender or AgeRange fails to typecheck
// here instead of silently refusing to restore the new value.
const GENDERS: Record<Gender, true> = { Male: true, Female: true };
const AGE_RANGES: Record<AgeRange, true> = {
  '18-29': true,
  '30-44': true,
  '45-60': true,
  '60+': true,
};
const GOALS: ReadonlySet<string> = new Set(GOAL_OPTIONS.map((g) => g.value));

// ─── What onboarding requires (shared with app/onboarding.tsx) ──────────────

/** Step 2 weight rule. `!isNaN` rather than isFinite, matching the screen. */
export function isOnboardingWeightValid(weightLbs: number): boolean {
  return !isNaN(weightLbs) && weightLbs >= 50 && weightLbs <= 1000;
}

/** Step 2 height rule, as typed: feet required, inches optional. */
export function isOnboardingHeightValid(feet: number, inches: number): boolean {
  return !isNaN(feet) && feet >= 3 && feet <= 8 && (isNaN(inches) || (inches >= 0 && inches < 12));
}

/** The same height rule applied to the stored total, `feet * 12 + inches`. */
export function isStoredHeightValid(heightInches: number): boolean {
  if (typeof heightInches !== 'number' || isNaN(heightInches)) return false;
  const feet = Math.floor(heightInches / 12);
  return isOnboardingHeightValid(feet, heightInches - feet * 12);
}

export type AboutYouAnswers = Pick<OnboardingProfile, 'gender' | 'ageRange' | 'healthGoals'>;
export type BodyAnswers = Pick<BodyMetrics, 'weightLbs' | 'heightInches'>;

/** Step 1 is answered. */
export function aboutYouAnswered(a: AboutYouAnswers): boolean {
  return Boolean(a.gender && a.ageRange && a.healthGoals.length > 0);
}

/** Step 2 is answered. */
export function basicsAnswered(b: BodyAnswers | null | undefined): boolean {
  return (
    typeof b?.weightLbs === 'number' &&
    isOnboardingWeightValid(b.weightLbs) &&
    typeof b?.heightInches === 'number' &&
    isStoredHeightValid(b.heightInches)
  );
}

// ─── Reading server JSON ─────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export type ParsedSnapshot =
  | { status: 'absent' }
  /** Written by a newer build. Neither restored from nor overwritten. */
  | { status: 'unsupported' }
  | { status: 'ok'; snapshot: OnboardingSnapshot };

/** `health_profiles.profile.onboarding`, validated field by field. */
export function parseOnboardingSnapshot(profileJson: unknown): ParsedSnapshot {
  if (!isObject(profileJson)) return { status: 'absent' };
  const raw = profileJson.onboarding;
  if (!isObject(raw)) return { status: 'absent' };
  if (raw.version !== ONBOARDING_SNAPSHOT_VERSION) {
    return typeof raw.version === 'number' && raw.version > ONBOARDING_SNAPSHOT_VERSION
      ? { status: 'unsupported' }
      : { status: 'absent' };
  }
  const gender =
    typeof raw.gender === 'string' && Object.prototype.hasOwnProperty.call(GENDERS, raw.gender)
      ? (raw.gender as Gender)
      : null;
  const ageRange =
    typeof raw.ageRange === 'string' && Object.prototype.hasOwnProperty.call(AGE_RANGES, raw.ageRange)
      ? (raw.ageRange as AgeRange)
      : null;
  const healthGoals = Array.isArray(raw.healthGoals)
    ? [...new Set(raw.healthGoals.filter((g): g is GoalType => typeof g === 'string' && GOALS.has(g)))]
    : [];
  const completedAt =
    typeof raw.completedAt === 'string' && !isNaN(Date.parse(raw.completedAt))
      ? raw.completedAt
      : null;
  return {
    status: 'ok',
    snapshot: { version: ONBOARDING_SNAPSHOT_VERSION, gender, ageRange, healthGoals, completedAt },
  };
}

/** `health_profiles.profile.bodyMetrics` weight and height, if present. */
export function readBodyAnswers(profileJson: unknown): BodyAnswers {
  if (!isObject(profileJson) || !isObject(profileJson.bodyMetrics)) return {};
  const { weightLbs, heightInches } = profileJson.bodyMetrics;
  return {
    ...(typeof weightLbs === 'number' ? { weightLbs } : {}),
    ...(typeof heightInches === 'number' ? { heightInches } : {}),
  };
}

// ─── The decision ────────────────────────────────────────────────────────────

/** Result of reading `health_profiles` for the signed-in user. */
export type ServerProfileFetch =
  /** `profile` is null when the user has no row yet. */
  | { status: 'ok'; userId: string; profile: unknown }
  | { status: 'signed-out' }
  /** Network, PostgREST or timeout. Unknown is never evidence. */
  | { status: 'error' };

export interface LocalOnboardingState {
  isComplete: boolean;
  profile: OnboardingProfile;
}

export interface RestorePlanInput {
  /** The live session's user id at the moment the plan is applied. */
  currentUserId: string | null;
  fetch: ServerProfileFetch;
  local: LocalOnboardingState;
  /** Body metrics in the local health store after the fetch landed. */
  localBody: BodyAnswers;
  nowIso: string;
}

export type RestoreDecision =
  | 'signed-out'
  | 'fetch-failed'
  | 'unsupported-snapshot'
  | 'already-complete'
  | 'complete'
  | 'resume'
  | 'fresh';

export type OnboardingStep = 1 | 2 | 3;

export interface RestorePlan {
  decision: RestoreDecision;
  /** Answers to write into the onboarding store; `isComplete` only on 'complete'. */
  onboardingPatch: { profile: Partial<AboutYouAnswers>; isComplete: boolean } | null;
  /** First unanswered step, on 'resume'. */
  resumeStep: OnboardingStep | null;
  /** Snapshot to record server-side, when the server's copy is missing or stale. */
  snapshotWrite: OnboardingSnapshot | null;
}

const NOTHING = (decision: RestoreDecision): RestorePlan => ({
  decision,
  onboardingPatch: null,
  resumeStep: null,
  snapshotWrite: null,
});

const sameGoals = (a: readonly GoalType[], b: readonly GoalType[]): boolean =>
  a.length === b.length && a.every((g) => b.includes(g));

/**
 * The snapshot a completed device should have on the server, or null when
 * nothing needs writing.
 *
 * Only a local completion that carries the step 1 answers is recorded. The
 * old /auth Sign Up tab and login path both marked onboarding complete while
 * asking nothing; that flag with no answers behind it is not evidence, and the
 * app already refuses to trust it (auth.tsx checks `ob.profile.gender`).
 */
export function snapshotToWrite(
  local: LocalOnboardingState,
  existing: OnboardingSnapshot | null,
  nowIso: string,
): OnboardingSnapshot | null {
  if (!local.isComplete || !aboutYouAnswered(local.profile)) return null;
  const { gender, ageRange, healthGoals } = local.profile;
  if (
    existing?.completedAt &&
    existing.gender === gender &&
    existing.ageRange === ageRange &&
    sameGoals(existing.healthGoals, healthGoals)
  ) {
    return null;
  }
  return {
    version: ONBOARDING_SNAPSHOT_VERSION,
    gender,
    ageRange,
    healthGoals: [...healthGoals],
    completedAt: existing?.completedAt ?? nowIso,
  };
}

export function planOnboardingRestore(input: RestorePlanInput): RestorePlan {
  const { currentUserId, fetch, local, localBody, nowIso } = input;

  // No session, or the fetch answered for somebody else: nothing to respect.
  if (!currentUserId) return NOTHING('signed-out');
  if (fetch.status === 'signed-out') return NOTHING('signed-out');
  if (fetch.status === 'error') return NOTHING('fetch-failed');
  if (fetch.userId !== currentUserId) return NOTHING('signed-out');

  const parsed = parseOnboardingSnapshot(fetch.profile);
  if (parsed.status === 'unsupported') return NOTHING('unsupported-snapshot');
  const snapshot = parsed.status === 'ok' ? parsed.snapshot : null;

  // Already complete on this device: leave it exactly as it is, and make sure
  // the server holds the answers so the NEXT device can restore them.
  if (local.isComplete) {
    return { ...NOTHING('already-complete'), snapshotWrite: snapshotToWrite(local, snapshot, nowIso) };
  }

  // Complete on the server: every required answer, and the record that the
  // final step succeeded. Body metrics must come from the SERVER row itself.
  if (
    snapshot?.completedAt &&
    aboutYouAnswered(snapshot) &&
    basicsAnswered(readBodyAnswers(fetch.profile))
  ) {
    return {
      decision: 'complete',
      onboardingPatch: {
        profile: {
          gender: snapshot.gender,
          ageRange: snapshot.ageRange,
          healthGoals: [...snapshot.healthGoals],
        },
        isComplete: true,
      },
      resumeStep: null,
      snapshotWrite: null,
    };
  }

  // Partial. Fill only what this device lacks — answers typed here this
  // session are newer than anything on the server — and resume at the first
  // step still unanswered.
  const fill: Partial<AboutYouAnswers> = {};
  if (!local.profile.gender && snapshot?.gender) fill.gender = snapshot.gender;
  if (!local.profile.ageRange && snapshot?.ageRange) fill.ageRange = snapshot.ageRange;
  if (local.profile.healthGoals.length === 0 && snapshot && snapshot.healthGoals.length > 0) {
    fill.healthGoals = [...snapshot.healthGoals];
  }
  const merged: AboutYouAnswers = { ...local.profile, ...fill };
  const step: OnboardingStep = !aboutYouAnswered(merged) ? 1 : !basicsAnswered(localBody) ? 2 : 3;
  const hasFill = Object.keys(fill).length > 0;

  if (!hasFill && step === 1) return NOTHING('fresh');
  return {
    decision: 'resume',
    onboardingPatch: hasFill ? { profile: fill, isComplete: false } : null,
    resumeStep: step,
    snapshotWrite: null,
  };
}
