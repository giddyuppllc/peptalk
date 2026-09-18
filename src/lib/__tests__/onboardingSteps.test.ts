/**
 * 2.1(a) — a signed-in visitor must never land back on the Welcome step, whose
 * visible action is "Already have an account? Sign In" → /auth. That is the
 * "sent back to the login page after logging in" rejection on a clean install
 * (1.9.8 (47), 1.10.0 (75)). See src/lib/onboardingSteps.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  WELCOME_STEP,
  FIRST_QUESTION_STEP,
  visibleOnboardingStep,
  onboardingBackAction,
  showOnboardingBack,
  showSignInLink,
  shouldForwardHome,
} from '../onboardingSteps';

const signedOut = { isAuthenticated: false, isEditMode: false };
const signedIn = { isAuthenticated: true, isEditMode: false };
const editing = { isAuthenticated: true, isEditMode: true };

describe('visibleOnboardingStep', () => {
  it('shows Welcome to a signed-out visitor', () => {
    expect(visibleOnboardingStep(WELCOME_STEP, signedOut)).toBe(WELCOME_STEP);
  });

  it('never shows Welcome to a signed-in visitor (clean-install login path)', () => {
    expect(visibleOnboardingStep(WELCOME_STEP, signedIn)).toBe(FIRST_QUESTION_STEP);
  });

  it('never shows Welcome in edit mode', () => {
    expect(visibleOnboardingStep(WELCOME_STEP, editing)).toBe(FIRST_QUESTION_STEP);
  });

  it('leaves later steps alone', () => {
    for (const step of [1, 2, 3]) {
      expect(visibleOnboardingStep(step, signedIn)).toBe(step);
      expect(visibleOnboardingStep(step, signedOut)).toBe(step);
    }
  });
});

describe('onboardingBackAction', () => {
  it('a signed-in visitor cannot Back from the first question into Welcome', () => {
    expect(onboardingBackAction(FIRST_QUESTION_STEP, signedIn)).toEqual({ kind: 'none' });
    expect(showOnboardingBack(FIRST_QUESTION_STEP, signedIn)).toBe(false);
  });

  it('a signed-out visitor can Back to Welcome', () => {
    expect(onboardingBackAction(FIRST_QUESTION_STEP, signedOut)).toEqual({ kind: 'step', step: WELCOME_STEP });
    expect(showOnboardingBack(FIRST_QUESTION_STEP, signedOut)).toBe(true);
  });

  it('edit mode exits the screen from the first question', () => {
    expect(onboardingBackAction(FIRST_QUESTION_STEP, editing)).toEqual({ kind: 'exit' });
  });

  it('later steps step back by one for everyone', () => {
    expect(onboardingBackAction(3, signedIn)).toEqual({ kind: 'step', step: 2 });
    expect(onboardingBackAction(2, signedIn)).toEqual({ kind: 'step', step: 1 });
    expect(onboardingBackAction(2, signedOut)).toEqual({ kind: 'step', step: 1 });
  });

  it('no Back reaches step 0 for a signed-in visitor from any step', () => {
    for (const step of [0, 1, 2, 3]) {
      const a = onboardingBackAction(visibleOnboardingStep(step, signedIn), signedIn);
      if (a.kind === 'step') expect(a.step).toBeGreaterThanOrEqual(FIRST_QUESTION_STEP);
    }
  });
});

describe('showSignInLink', () => {
  it('renders only when signed out', () => {
    expect(showSignInLink(signedOut)).toBe(true);
    expect(showSignInLink(signedIn)).toBe(false);
  });
});

describe('shouldForwardHome — respects completion, never grants it', () => {
  it('forwards a signed-in, onboarded visitor from a fresh screen', () => {
    expect(shouldForwardHome(WELCOME_STEP, { ...signedIn, isComplete: true })).toBe(true);
  });

  it('does not forward a signed-in visitor who has not been onboarded', () => {
    expect(shouldForwardHome(WELCOME_STEP, { ...signedIn, isComplete: false })).toBe(false);
  });

  it('does not forward a signed-out visitor, even if the local flag says complete', () => {
    expect(shouldForwardHome(WELCOME_STEP, { ...signedOut, isComplete: true })).toBe(false);
  });

  it('does not forward in edit mode or mid-flow', () => {
    expect(shouldForwardHome(WELCOME_STEP, { ...editing, isComplete: true })).toBe(false);
    expect(shouldForwardHome(3, { ...signedIn, isComplete: true })).toBe(false);
  });
});

describe('app/onboarding.tsx is wired to these rules', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'onboarding.tsx'), 'utf8');
  const code = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

  it('renders from the derived step, not the stored one', () => {
    expect(code).toMatch(/const step = visibleOnboardingStep\(storedStep, stepCtx\)/);
  });

  it('gates the Sign In link on showSignInLink', () => {
    const link = code.indexOf("router.push('/auth')");
    expect(link).toBeGreaterThan(-1);
    const before = code.slice(Math.max(0, link - 200), link);
    expect(before).toMatch(/showSignInLink\(stepCtx\) &&/);
    // Exactly one push to /auth — a second ungated one would reopen the loop.
    expect(code.split("router.push('/auth')").length - 1).toBe(1);
  });

  it('routes Back through onboardingBackAction, with no raw decrement', () => {
    expect(code).toMatch(/onboardingBackAction\(step, stepCtx\)/);
    expect(code).not.toMatch(/setStep\(\(s\) => s - 1\)/);
  });

  it('every footer Back button is gated on showBack', () => {
    const backButtons = code.split('onPress={handleBack}').length - 1;
    const gated = code.split('{showBack ? (').length - 1;
    expect(backButtons).toBeGreaterThan(0);
    expect(gated).toBe(backButtons);
  });
});
