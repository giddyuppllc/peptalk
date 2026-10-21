/**
 * Which onboarding step a visitor may see — kept pure so it can be tested.
 *
 * App Review rejected 1.9.8 (47) and 1.10.0 (75) under 2.1(a): "redirected back
 * to the login page after logging in", on a clean install. The path:
 *
 *   1. A fresh install boots to /onboarding, step 0 (Welcome).
 *   2. The reviewer taps "Already have an account? Sign In" → /auth.
 *   3. Login succeeds. Onboarding answers live only on the device, so a clean
 *      install has none, and auth.tsx correctly sends them to /onboarding.
 *   4. Onboarding started at step 0 regardless of the session — the Welcome
 *      screen again, whose visible action is "Sign In", which goes to /auth.
 *
 * A signed-in visitor already has an account, so the Welcome step (whose only
 * job is "Get Started" vs "Sign In") has nothing to offer them. The rules:
 *
 *   - a signed-in visitor is never shown step 0, whatever the stored step is —
 *     derived at render time, so a screen instance that was mounted at step 0
 *     underneath /auth cannot show it for even one frame when refocused;
 *   - Back never returns a signed-in visitor to step 0;
 *   - the Sign In link renders only for a signed-out visitor.
 *
 * None of this touches `isComplete`. Auth may respect onboarding completion,
 * never grant it — see src/lib/__tests__/onboardingCompletionGate.test.ts.
 * Restoring completion from the server's record is src/lib/onboardingRestore.ts.
 */

export const WELCOME_STEP = 0;
export const FIRST_QUESTION_STEP = 1;

export interface OnboardingStepContext {
  /** There is a live session. */
  isAuthenticated: boolean;
  /** Opened from Profile → Edit Profile (`/onboarding?edit=true`). */
  isEditMode: boolean;
}

/**
 * The step to render for a stored step. The session can appear AFTER mount
 * (the screen stays mounted beneath /auth while the user signs in), so a
 * starting value chosen at mount is not enough — this is applied every render.
 */
export function visibleOnboardingStep(storedStep: number, ctx: OnboardingStepContext): number {
  if (storedStep <= WELCOME_STEP && (ctx.isAuthenticated || ctx.isEditMode)) {
    return FIRST_QUESTION_STEP;
  }
  return storedStep;
}

export type OnboardingBackAction =
  | { kind: 'none' }
  | { kind: 'exit' }
  | { kind: 'step'; step: number };

/** What Back does from the visible step. */
export function onboardingBackAction(visibleStep: number, ctx: OnboardingStepContext): OnboardingBackAction {
  if (visibleStep <= WELCOME_STEP) return { kind: 'none' };
  if (visibleStep === FIRST_QUESTION_STEP) {
    if (ctx.isEditMode) return { kind: 'exit' };
    if (ctx.isAuthenticated) return { kind: 'none' };
  }
  return { kind: 'step', step: visibleStep - 1 };
}

/** Whether a Back control should render at all on the visible step. */
export function showOnboardingBack(visibleStep: number, ctx: OnboardingStepContext): boolean {
  return onboardingBackAction(visibleStep, ctx).kind !== 'none';
}

/** "Already have an account? Sign In" is for signed-out visitors only. */
export function showSignInLink(ctx: Pick<OnboardingStepContext, 'isAuthenticated'>): boolean {
  return !ctx.isAuthenticated;
}

/**
 * A signed-in, already-onboarded visitor who arrives at a fresh onboarding
 * screen goes straight home. This used to wait 1.8s on the Welcome step (with
 * its Sign In link showing) before forwarding. It keys on the STORED step so it
 * cannot fire as the final step completes onboarding and routes home itself.
 */
export function shouldForwardHome(
  storedStep: number,
  ctx: OnboardingStepContext & { isComplete: boolean },
): boolean {
  return storedStep === WELCOME_STEP && ctx.isAuthenticated && ctx.isComplete && !ctx.isEditMode;
}

/**
 * Hold a fresh onboarding screen blank while the server restore for this
 * signed-in user is still out (src/services/onboardingRestore.ts).
 *
 * Without it a returning user on a new device sees step 1 for as long as the
 * profile fetch takes, then gets pulled home or forward mid-glance. Keyed on
 * the STORED step, like shouldForwardHome, so a user already answering
 * questions is never blanked. `waitElapsed` is the screen's own ceiling: a
 * restore that never settles costs a short delay, never a blank screen.
 */
export function shouldAwaitServerRestore(
  storedStep: number,
  ctx: OnboardingStepContext & { isComplete: boolean; restoreSettled: boolean; waitElapsed: boolean },
): boolean {
  return (
    storedStep === WELCOME_STEP &&
    ctx.isAuthenticated &&
    !ctx.isComplete &&
    !ctx.isEditMode &&
    !ctx.restoreSettled &&
    !ctx.waitElapsed
  );
}

/**
 * The step to jump to for a restore's resume point, or null to stay put.
 * Forward only, from a screen that has not moved yet: answers being typed are
 * never yanked backwards or skipped past.
 */
export function resumeStepToApply(
  storedStep: number,
  resumeStep: number | null,
  ctx: OnboardingStepContext,
): number | null {
  if (resumeStep == null || ctx.isEditMode || !ctx.isAuthenticated) return null;
  if (storedStep !== WELCOME_STEP) return null;
  if (resumeStep <= visibleOnboardingStep(storedStep, ctx)) return null;
  return resumeStep;
}
