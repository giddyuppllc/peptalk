/**
 * The onboarding restore's order of operations, with its dependencies passed
 * in so the sequencing — not just the decision — is unit-tested.
 *
 * The decision itself is `planOnboardingRestore` (./onboardingRestore.ts). This
 * file owns the parts that have bitten before in this codebase:
 *
 *   - a fetch that hangs: bounded by ONBOARDING_RESTORE_TIMEOUT_MS, and an
 *     unfinished fetch is treated as "unknown", which grants nothing;
 *   - a session that disappears while the fetch is out: the plan is made with
 *     the user id read AFTER the fetch, so a sign-out in between restores
 *     nothing (that is the `isComplete: true, isAuthenticated: false` state the
 *     2.1(a) rejections came from);
 *   - several callers at once (boot, the sign-in effect, handleLogin): one run
 *     per user, shared;
 *   - status always reaches 'settled', whatever throws, so the onboarding
 *     screen never waits on a restore that died.
 *
 * The wiring to the real stores is src/services/onboardingRestore.ts.
 */

import {
  ONBOARDING_RESTORE_TIMEOUT_MS,
  planOnboardingRestore,
  type BodyAnswers,
  type LocalOnboardingState,
  type OnboardingStep,
  type RestoreDecision,
  type RestorePlan,
  type ServerProfileFetch,
} from './onboardingRestore';
import type { OnboardingSnapshot } from '../types';
import { withTimeout } from './withTimeout';

export type RestoreStatus = 'idle' | 'pending' | 'settled';

export interface OnboardingRestoreDeps {
  /** The live session's user id, or null when signed out. */
  getCurrentUserId(): string | null;
  /** Resolves once the persisted stores have rehydrated from the device. */
  waitForLocalStores(): Promise<void>;
  fetchServerProfile(): Promise<ServerProfileFetch>;
  getLocal(): LocalOnboardingState;
  /** Local health-store body metrics, read after the fetch has landed. */
  getLocalBody(): BodyAnswers;
  applyOnboardingPatch(patch: NonNullable<RestorePlan['onboardingPatch']>): void;
  setResumeStep(resume: { userId: string; step: OnboardingStep }): void;
  setRestoreStatus(userId: string, status: RestoreStatus): void;
  /** Records the snapshot locally and upserts it. Not awaited by the run. */
  writeSnapshot(snapshot: OnboardingSnapshot): Promise<boolean>;
  now(): string;
  report?(err: unknown, source: string): void;
  timeoutMs?: number;
}

export function createOnboardingRestorer(deps: OnboardingRestoreDeps) {
  let inflight: { userId: string; promise: Promise<RestoreDecision> } | null = null;

  return function restoreOnboarding(): Promise<RestoreDecision> {
    const userId = deps.getCurrentUserId();
    if (!userId) return Promise.resolve('signed-out');
    if (inflight && inflight.userId === userId) return inflight.promise;

    const run = async (): Promise<RestoreDecision> => {
      deps.setRestoreStatus(userId, 'pending');
      try {
        let fetch: ServerProfileFetch;
        try {
          fetch = await withTimeout(
            (async () => {
              await deps.waitForLocalStores();
              return deps.fetchServerProfile();
            })(),
            deps.timeoutMs ?? ONBOARDING_RESTORE_TIMEOUT_MS,
            'Onboarding restore',
          );
        } catch (err) {
          deps.report?.(err, 'onboardingRestore.fetch');
          fetch = { status: 'error' };
        }

        const plan = planOnboardingRestore({
          // Read now, not before the fetch: a sign-out during it must win, and
          // a different account signing in makes the fetch answer for nobody
          // on screen (the plan compares it with fetch.userId).
          currentUserId: deps.getCurrentUserId(),
          fetch,
          local: deps.getLocal(),
          localBody: deps.getLocalBody(),
          nowIso: deps.now(),
        });

        if (plan.onboardingPatch) deps.applyOnboardingPatch(plan.onboardingPatch);
        if (plan.resumeStep) deps.setResumeStep({ userId, step: plan.resumeStep });
        if (plan.snapshotWrite) {
          deps.writeSnapshot(plan.snapshotWrite).catch((err) =>
            deps.report?.(err, 'onboardingRestore.writeSnapshot'),
          );
        }
        return plan.decision;
      } catch (err) {
        deps.report?.(err, 'onboardingRestore.apply');
        return 'fetch-failed';
      } finally {
        deps.setRestoreStatus(userId, 'settled');
      }
    };

    const promise = run().finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
    inflight = { userId, promise };
    return promise;
  };
}
