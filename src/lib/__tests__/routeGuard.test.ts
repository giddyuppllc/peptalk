import { decideRoute, type RouteGuardState } from '../routeGuard';

const state = (over: Partial<RouteGuardState> = {}): RouteGuardState => ({
  isComplete: true,
  authHydrated: true,
  isAuthenticated: true,
  inOnboarding: false,
  inAuth: false,
  ...over,
});

describe('boot route guard', () => {
  describe('the regression it exists for', () => {
    it('sends an onboarded but signed-out visitor to /auth', () => {
      // The old effect read `if (isComplete) return;` — finishing onboarding
      // once granted permanent access with no login. On the PWA that state
      // lives in localStorage, so it was trivially forgeable.
      expect(decideRoute(state({ isAuthenticated: false }))).toBe('/auth');
    });

    it('does not let a forged onboarding flag skip authentication', () => {
      // Exactly what a hand-edited peptalk-onboarding entry looks like:
      // complete, hydrated, no session.
      expect(decideRoute(state({ isComplete: true, isAuthenticated: false }))).toBe('/auth');
    });
  });

  describe('onboarding comes first', () => {
    it('sends a brand-new visitor to /onboarding', () => {
      expect(
        decideRoute(state({ isComplete: false, isAuthenticated: false })),
      ).toBe('/onboarding');
    });

    it('leaves them alone once they are in onboarding', () => {
      expect(
        decideRoute(state({ isComplete: false, isAuthenticated: false, inOnboarding: true })),
      ).toBeNull();
    });

    it('allows /auth during onboarding, since onboarding hands off to sign-up', () => {
      expect(
        decideRoute(state({ isComplete: false, isAuthenticated: false, inAuth: true })),
      ).toBeNull();
    });

    it('still requires onboarding even for a signed-in user', () => {
      expect(decideRoute(state({ isComplete: false, isAuthenticated: true }))).toBe('/onboarding');
    });
  });

  describe('never bounces a signed-in user by mistake', () => {
    it('waits for the auth store instead of assuming signed-out', () => {
      // The dangerous inverse of the bug: redirecting before rehydration
      // would log real users out on every cold start.
      expect(
        decideRoute(state({ authHydrated: false, isAuthenticated: false })),
      ).toBeNull();
    });

    it('allows every route once onboarded and signed in', () => {
      expect(decideRoute(state())).toBeNull();
    });

    it('does not loop while already on /auth', () => {
      expect(
        decideRoute(state({ isAuthenticated: false, inAuth: true })),
      ).toBeNull();
    });
  });


  describe('the dead end that reads as "logged in, sent back to login"', () => {
    // App Review 2.1(a), 29 Aug, build 1.10.0 (75).
    //
    // The guard is not the bug — the sweep above proves it cannot loop. The bug
    // is a caller putting the app into a state the guard then correctly pins.
    // `isComplete: true` with `isAuthenticated: false` is exactly that state:
    // legitimate mid-signup, and a trap if anything sets it while the user has
    // no session and no route forward.
    //
    // onboarding.tsx used to call completeOnboarding() BEFORE checking whether
    // signup returned a session. On an email-confirmation signup that left the
    // user onboarded-but-signed-out, parked on /auth, where logging in failed
    // with "email not confirmed" as small inline text.
    it('pins an onboarded-but-signed-out visitor on /auth with no way out', () => {
      const stuck = state({ isComplete: true, isAuthenticated: false, inAuth: true });
      expect(decideRoute(stuck)).toBeNull();
      // and from anywhere else it sends them straight back
      expect(
        decideRoute({ ...stuck, inAuth: false }),
      ).toBe('/auth');
    });

    it('lets them through the moment a session exists', () => {
      expect(
        decideRoute(state({ isComplete: true, isAuthenticated: true, inAuth: false })),
      ).toBeNull();
    });

    it('never bounces mid-rehydrate, whatever the persisted flags say', () => {
      // The persist layer re-derives isAuthenticated from `user`, so the app can
      // render signed-in and be corrected a moment later. Bouncing during that
      // window is the visible "I was in, then thrown out".
      for (const isAuthenticated of [true, false])
        for (const isComplete of [true, false])
          expect(
            decideRoute(state({ authHydrated: false, isAuthenticated, isComplete })),
          ).toBe(isComplete ? null : '/onboarding');
    });
  });

  it('never returns a redirect that would re-trigger itself', () => {
    // Exhaustive sweep of the state space: whatever the guard returns, landing
    // on that route must produce null, or the app redirect-loops on boot.
    const bools = [true, false];
    for (const isComplete of bools)
      for (const authHydrated of bools)
        for (const isAuthenticated of bools) {
          const s = state({ isComplete, authHydrated, isAuthenticated });
          const target = decideRoute(s);
          if (!target) continue;
          const landed = decideRoute({
            ...s,
            inOnboarding: target === '/onboarding',
            inAuth: target === '/auth',
          });
          expect(landed).toBeNull();
        }
  });
});
