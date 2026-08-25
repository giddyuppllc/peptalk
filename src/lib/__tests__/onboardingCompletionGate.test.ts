/**
 * Signing in must never be mistaken for having been onboarded.
 *
 * Two doors created accounts, and only one asked the questions:
 *
 *   1. onboarding.tsx step 3 — asks sex, age, goals, weight, height, THEN
 *      creates the account. Correct.
 *   2. the /auth "Sign Up" tab — created the account, called
 *      completeOnboarding(), and dropped the user straight into the app
 *      having asked nothing.
 *
 * Because onboarding was flagged complete, door 2's users were never asked
 * again. Downstream: the male theme for everyone (useTheme resolves anything
 * that is not 'Female' to male), macros that never calculate, dose calculators
 * without inputs, and women not seeing Cycle tracking because gender is null.
 *
 * handleLogin had the same defect for a wider group: useOnboardingStore has NO
 * server sync — it is absent from the boot sync list and nothing writes gender
 * or goals to the profiles table — so every reinstall and every new phone
 * arrives with an empty profile, and login marked it complete anyway.
 *
 * The rule pinned here: auth code may RESPECT completion, never GRANT it.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const auth = fs.readFileSync(path.join(ROOT, 'app', 'auth.tsx'), 'utf8');
const onboarding = fs.readFileSync(path.join(ROOT, 'app', 'onboarding.tsx'), 'utf8');

describe('app/auth.tsx', () => {
  it('is the file we think it is', () => {
    expect(auth).toMatch(/handleSignup/);
    expect(auth).toMatch(/handleLogin|await login\(/);
  });

  it('never calls completeOnboarding()', () => {
    // The whole defect in one line. Neither signing in nor signing up is
    // evidence that the questions were answered.
    const calls = auth
      .split('\n')
      .filter((l) => /completeOnboarding\(\)/.test(l))
      .filter((l) => !l.trim().startsWith('//'));
    expect(calls).toEqual([]);
  });

  it('sends a brand-new signup into onboarding', () => {
    expect(auth).toMatch(/router\.replace\('\/onboarding'\)/);
  });

  it('only skips onboarding when the answers actually exist', () => {
    // Guards against "isComplete" alone being trusted: a store can be flagged
    // complete with an empty profile, which is exactly how this started.
    expect(auth).toMatch(/ob\.isComplete && ob\.profile\.gender/);
  });
});

describe('app/onboarding.tsx handles an already-authenticated user', () => {
  it('does not call signup() when a session already exists', () => {
    expect(onboarding).toMatch(/isAuthenticated\s*\n?\s*\?\s*\{\s*requiresEmailConfirmation:\s*false\s*\}/);
  });

  it('does not gate the final step on credentials it will not ask for', () => {
    expect(onboarding).toMatch(/if \(isAuthenticated\) return acceptedTerms;/);
  });

  it('still requires the medical disclaimer from everyone', () => {
    // Consent is about the content, not the account — it must survive the
    // authenticated shortcut.
    const i = onboarding.indexOf('if (isAuthenticated) return acceptedTerms;');
    expect(i).toBeGreaterThan(-1);
  });

  it('hides the credential fields when already signed in', () => {
    expect(onboarding).toMatch(/\{!isAuthenticated && \(/);
  });
});
