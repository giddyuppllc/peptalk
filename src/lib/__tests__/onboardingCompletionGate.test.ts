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

const stripComments = (src: string) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

describe('only the final onboarding step calls completeOnboarding()', () => {
  // Restoring from the server sets isComplete from the server's record inside
  // src/services/onboardingRestore.ts; nothing else may flip it. The auth deep
  // link in app/_layout.tsx used to call completeOnboarding() for anyone who
  // opened a confirmation or password-recovery link.
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(p);
      return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });
  const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))];

  it('scans a real corpus', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(path.join('app', 'onboarding.tsx')))).toBe(true);
  });

  it('finds exactly one caller: app/onboarding.tsx', () => {
    const callers = files
      .filter((f) => /completeOnboarding\(\)/.test(stripComments(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
    expect(callers).toEqual(['app/onboarding.tsx']);
  });
});

describe('sign-in restores from the server before deciding, and still only respects', () => {
  const layout = stripComments(fs.readFileSync(path.join(ROOT, 'app', '_layout.tsx'), 'utf8'));
  const service = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'services', 'onboardingRestore.ts'), 'utf8'),
  );

  it('handleLogin awaits the restore before reading the onboarding store', () => {
    const login = auth.slice(auth.indexOf('const handleLogin'), auth.indexOf('const handleSignup'));
    const restore = login.indexOf('await restoreOnboardingFromServer()');
    const read = login.indexOf('const ob = useOnboardingStore.getState()');
    expect(restore).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(restore);
  });

  it('the auth deep link restores, then routes on real completion', () => {
    const i = layout.indexOf("url.startsWith('peptalk://auth')");
    const handler = layout.slice(i, layout.indexOf('Linking.getInitialURL()', i));
    expect(handler).toMatch(/await restoreOnboardingFromServer\(\);/);
    // The landing decision moved into src/lib/passwordRecovery.postAuthLinkRoute
    // on 2026-09-16, so a recovery link can reach the set-password step instead
    // of being routed home like a confirmation. The handler must still feed it
    // the REAL completion state and nothing else — it may not compute its own.
    expect(handler).toMatch(
      /router\.replace\(\s*postAuthLinkRoute\(\{\s*recovery,\s*onboardingComplete: ob\.isComplete,\s*hasGender: !!ob\.profile\.gender,\s*\}\)/,
    );
    expect(handler).not.toMatch(/completeOnboarding\(/);
  });

  it('and that helper still only respects completion — it never grants it', () => {
    // Asserted here as well as in passwordRecovery.test.ts, because this file
    // is where "auth may RESPECT completion, never GRANT it" is kept honest,
    // and the rule now lives one module away.
    const { postAuthLinkRoute } = require('../passwordRecovery');
    expect(postAuthLinkRoute({ recovery: false, onboardingComplete: true, hasGender: true })).toBe('/(tabs)');
    expect(postAuthLinkRoute({ recovery: false, onboardingComplete: true, hasGender: false })).toBe('/onboarding');
    expect(postAuthLinkRoute({ recovery: false, onboardingComplete: false, hasGender: true })).toBe('/onboarding');
    expect(postAuthLinkRoute({ recovery: false, onboardingComplete: false, hasGender: false })).toBe('/onboarding');
    // A recovery link must not become a way into the app either: it goes to
    // the password step, never to /(tabs), whatever the onboarding state.
    expect(postAuthLinkRoute({ recovery: true, onboardingComplete: true, hasGender: true })).toBe('/set-password');
  });

  it('the restore can only raise isComplete, never set it outright', () => {
    // Every `isComplete:` in the wiring either carries the current value
    // through unchanged, or ORs the plan's grant onto it. Nothing else.
    const values = (service.match(/isComplete:\s*[^,}\n]*/g) ?? []).map((m) => m.replace(/^isComplete:\s*/, '').trim());
    expect(values).toContain('state.isComplete || patch.isComplete');
    for (const v of values) expect(['state.isComplete', 'state.isComplete || patch.isComplete']).toContain(v);
  });
});

describe('the restore judges "answered" exactly as the onboarding screen does', () => {
  // src/lib/onboardingRestore.ts restores completion only when every required
  // answer exists. "Required" is this screen's canContinue. If a question is
  // added or loosened here, this fails until the restore follows.
  const code = stripComments(onboarding);

  it('step 1 still requires sex, the age gate and a goal', () => {
    expect(code).toMatch(
      /if \(step === 1\) return Boolean\(profile\.gender && selectedAge >= MIN_AGE && profile\.healthGoals\.length > 0\);/,
    );
  });

  it('step 2 still requires weight and height, by the shared rules', () => {
    expect(code).toMatch(/if \(step === 2\) return weightValid && heightValid;/);
    expect(code).toMatch(/const weightValid = useMemo\(\(\) => isOnboardingWeightValid\(parseFloat\(weightLbs\)\), \[weightLbs\]\);/);
    expect(code).toMatch(/isOnboardingHeightValid\(parseInt\(heightFeet, 10\), parseInt\(heightInches, 10\)\)/);
  });

  it('a resumed user is attested with their stored age bucket, not ageToRange(0)', () => {
    // Resumed past step 1, selectedAge is still 0 and ageToRange(0) is '18-29'.
    expect(code).toMatch(
      /const attestedRange = selectedAge >= MIN_AGE \? ageToRange\(selectedAge\) : profile\.ageRange;/,
    );
    expect(code).toMatch(/if \(attestedRange\) void attestAge\(attestedRange, MIN_AGE\);/);
    expect(code).not.toMatch(/attestAge\(ageToRange\(selectedAge\)/);
  });

  it('step 3 still requires the disclaimer from everyone', () => {
    expect(code).toMatch(/if \(isAuthenticated\) return acceptedTerms;/);
    expect(code).toMatch(/emailOk &&\s*passwordCheck\.valid &&\s*acceptedTerms/);
  });
});

describe('completeOnboarding() runs only once a session exists', () => {
  // THE ORDERING IS THE 2.1(a) BUG, AND UNTIL 2026-09-16 NOTHING PINNED IT.
  //
  // app/onboarding.tsx explains at length why completeOnboarding() sits AFTER
  // the requiresEmailConfirmation check: called first, it leaves the app in
  // `isComplete: true, isAuthenticated: false` — which routeGuard reads as
  // "onboarded but signed out" and pins on /auth, where signing in fails with
  // "email not confirmed". That is indistinguishable from the rejection text
  // Apple sent twice: sent back to the login page after logging in.
  //
  // Mutation-tested: moving the call above the check left every other suite in
  // this file green. A rule that exists only as a paragraph is a rule the next
  // merge conflict resolves away, and this one is the most expensive rule here.
  //
  // It is also live: the same comment records that Supabase has
  // mailer_autoconfirm ON, so the branch does not fire today and is one
  // dashboard toggle from firing for every new account.
  const code = stripComments(onboarding);

  const confirmAt = code.indexOf('if (result.requiresEmailConfirmation) {');
  const completeAt = code.indexOf('completeOnboarding();');

  it('both landmarks are still in the file (anti-vacuity)', () => {
    // Without this, a rename makes indexOf return -1 twice and -1 < -1 is
    // false — the ordering assertion below would fail loudly rather than pass
    // silently, but say nothing useful about why.
    expect(confirmAt).toBeGreaterThan(-1);
    expect(completeAt).toBeGreaterThan(-1);
  });

  it('the email-confirmation check comes first', () => {
    expect(confirmAt).toBeLessThan(completeAt);
  });

  it('and that branch returns, so completion is never reached without a session', () => {
    // Ordering alone is not enough: the check has to STOP. Falling through it
    // would reach completeOnboarding() anyway, with no session.
    const branch = code.slice(confirmAt, completeAt);
    expect(branch).toMatch(/\n\s*return;/);
    // And the only thing it may do on the way out is send them to sign in.
    expect(branch).toMatch(/router\.replace\('\/auth'\)/);
  });

  it('the signup path routes home only after completion, never before', () => {
    // There are two router.replace('/(tabs)') in this file. The first is the
    // shouldForwardHome effect near the top, which sends an ALREADY-complete
    // signed-in user home and has nothing to do with this ordering; a bare
    // indexOf finds that one and makes this assertion meaningless. Search the
    // signup path only — from the confirmation check to the end of the handler.
    const handlerEnd = code.indexOf('const handleBack', completeAt);
    expect(handlerEnd).toBeGreaterThan(completeAt);
    const signupPath = code.slice(confirmAt, handlerEnd);
    const home = signupPath.indexOf("router.replace('/(tabs)')");
    expect(home).toBeGreaterThan(-1);
    expect(home).toBeGreaterThan(signupPath.indexOf('completeOnboarding();'));
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
