/**
 * Onboarding restore — wired to the real stores.
 *
 * READ src/lib/onboardingRestore.ts FIRST. That is the decision and the
 * reasoning; src/lib/onboardingRestoreRunner.ts is the order of operations.
 * This file only connects them to zustand and Supabase, plus:
 *
 *   - the WRITE path: whenever a completed onboarding's answers change (the
 *     final step, or Profile → Edit), they are mirrored into
 *     `health_profiles.profile.onboarding` so the next device can restore
 *     them. Gender, age and goals were written nowhere server-side before;
 *   - macro targets for a restored completion, computed exactly as the final
 *     onboarding step computes them, so a user who skips the questions on a
 *     new phone does not land on the default 2,000 kcal targets.
 */

import { captureException } from './telemetry';
import { syncHealthProfile } from './syncService';
import {
  computeMacroRecommendation,
  activityFromOnboarding,
  ageYearsFromRange,
  goalFromOnboarding,
} from './macroCalculator';
import { useAuthStore } from '../store/useAuthStore';
import { useOnboardingStore } from '../store/useOnboardingStore';
import {
  useHealthProfileStore,
  syncHealthProfileFromServer,
  isProfileSyncSuppressed,
} from '../store/useHealthProfileStore';
import { useMealStore, DEFAULT_TARGETS } from '../store/useMealStore';
import { useProgressGoalsStore } from '../store/useProgressGoalsStore';
import {
  parseOnboardingSnapshot,
  snapshotToWrite,
  type AboutYouAnswers,
} from '../lib/onboardingRestore';
import { createOnboardingRestorer } from '../lib/onboardingRestoreRunner';
import type { BodyMetrics, LifestyleProfile, OnboardingSnapshot } from '../types';

/** Longest the stores may take to rehydrate before the restore stops waiting. */
const STORE_HYDRATION_WAIT_MS = 4_000;

async function waitFor(check: () => boolean, ms: number): Promise<void> {
  const start = Date.now();
  while (!check() && Date.now() - start < ms) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Macro targets from onboarding answers — the one calculation both the final
 * onboarding step and a restored completion use.
 */
export function onboardingMacroTargets(
  answers: AboutYouAnswers,
  body: BodyMetrics,
  life: LifestyleProfile,
) {
  return body.weightLbs && body.heightInches && (answers.gender === 'Male' || answers.gender === 'Female')
    ? computeMacroRecommendation({
        weightLbs: body.weightLbs,
        heightInches: body.heightInches,
        ageYears: ageYearsFromRange(answers.ageRange),
        biologicalSex: answers.gender === 'Male' ? 'male' : 'female',
        activityLevel: activityFromOnboarding(life.activityLevel),
        goal: goalFromOnboarding(answers.healthGoals),
      })
    : null;
}

/** Writes the targets into the meal and progress-goal stores. */
export function applyMacroTargets(macros: NonNullable<ReturnType<typeof onboardingMacroTargets>>): void {
  useMealStore.getState().setTargets({
    calories: macros.calories, proteinGrams: macros.proteinGrams,
    carbsGrams: macros.carbsGrams, fatGrams: macros.fatGrams,
    fiberGrams: macros.fiberGrams, waterOz: macros.waterOz,
  });
  const setGoalValue = useProgressGoalsStore.getState().setGoalValue;
  setGoalValue('cal', macros.calories);
  setGoalValue('pro', macros.proteinGrams);
  setGoalValue('carb', macros.carbsGrams);
  setGoalValue('fat', macros.fatGrams);
  setGoalValue('fiber', macros.fiberGrams);
  setGoalValue('water', macros.waterOz);
}

const targetsUntouched = (): boolean => {
  const t = useMealStore.getState().targets;
  return (Object.keys(DEFAULT_TARGETS) as (keyof typeof DEFAULT_TARGETS)[]).every(
    (k) => t?.[k] === DEFAULT_TARGETS[k],
  );
};

const currentUserId = (): string | null => {
  const auth = useAuthStore.getState();
  return auth.isAuthenticated ? auth.user?.id ?? null : null;
};

async function writeSnapshot(snapshot: OnboardingSnapshot): Promise<boolean> {
  useHealthProfileStore.getState().setOnboardingSnapshot(snapshot);
  // Upserted directly as well as through the store's debounced sync, because
  // that path swallows failures and this one must not.
  const ok = await syncHealthProfile(useHealthProfileStore.getState().profile);
  if (!ok) {
    captureException(new Error('Onboarding snapshot was not saved'), {
      source: 'onboardingRestore.writeSnapshot',
    });
  }
  return ok;
}

export const restoreOnboardingFromServer = createOnboardingRestorer({
  getCurrentUserId: currentUserId,
  waitForLocalStores: async () => {
    await waitFor(
      () =>
        useOnboardingStore.getState().hasHydrated &&
        useHealthProfileStore.persist.hasHydrated() &&
        useMealStore.persist.hasHydrated(),
      STORE_HYDRATION_WAIT_MS,
    );
  },
  fetchServerProfile: () => syncHealthProfileFromServer(),
  getLocal: () => {
    const { isComplete, profile } = useOnboardingStore.getState();
    return { isComplete, profile };
  },
  getLocalBody: () => {
    const body = useHealthProfileStore.getState().profile?.bodyMetrics;
    return { weightLbs: body?.weightLbs, heightInches: body?.heightInches };
  },
  applyOnboardingPatch: (patch) => {
    useOnboardingStore.setState((state) => ({
      profile: { ...state.profile, ...patch.profile },
      // Only ever raised, never lowered, and only on the plan's 'complete'.
      isComplete: state.isComplete || patch.isComplete,
    }));
    if (patch.isComplete && targetsUntouched()) {
      const health = useHealthProfileStore.getState().profile;
      const macros = onboardingMacroTargets(
        useOnboardingStore.getState().profile,
        health?.bodyMetrics ?? {},
        health?.lifestyle ?? ({} as LifestyleProfile),
      );
      if (macros) applyMacroTargets(macros);
    }
  },
  setResumeStep: (resume) => useOnboardingStore.getState().setResumeStep(resume),
  setRestoreStatus: (userId, status) => useOnboardingStore.getState().setRestoreStatus(userId, status),
  writeSnapshot,
  now: () => new Date().toISOString(),
  report: (err, source) => captureException(err, { source }),
});

/** Forget a finished restore when the session ends, so the next one runs. */
export function clearOnboardingRestore(): void {
  const s = useOnboardingStore.getState();
  if (s.restore.status !== 'idle' || s.resumeStep) {
    useOnboardingStore.setState({ restore: { userId: null, status: 'idle' }, resumeStep: null });
  }
}

// ─── Write path: keep the server's copy of the answers current ─────────────
//
// Runs only once the restore for this user has settled. Before that, the
// restore's own reconcile covers it, and a write made while the fetch is out
// could be overwritten by the fetch's "server wins" a moment later.
//
// A device-local change (withoutProfileSync — Delete My Data, the sign-out
// wipe) writes nothing here either: this upserts health_profiles directly, so
// the health store's own suppression does not cover it.
useOnboardingStore.subscribe((state, prev) => {
  if (state.profile === prev.profile && state.isComplete === prev.isComplete) return;
  if (isProfileSyncSuppressed()) return;
  const userId = currentUserId();
  if (!userId || state.restore.userId !== userId || state.restore.status !== 'settled') return;
  const parsed = parseOnboardingSnapshot(useHealthProfileStore.getState().profile);
  if (parsed.status === 'unsupported') return;
  const snapshot = snapshotToWrite(
    { isComplete: state.isComplete, profile: state.profile },
    parsed.status === 'ok' ? parsed.snapshot : null,
    new Date().toISOString(),
  );
  if (snapshot) {
    writeSnapshot(snapshot).catch((err) =>
      captureException(err, { source: 'onboardingRestore.mirror' }),
    );
  }
});
