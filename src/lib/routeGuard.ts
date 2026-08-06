/**
 * Boot route guard — the single decision of where a visitor is allowed to be.
 *
 * Extracted from app/_layout.tsx because it is a security gate, it regressed
 * silently once, and buried inside a 1,200-line effect nothing could test it.
 *
 * The regression: the effect read `if (isComplete) return;`, so finishing
 * onboarding once granted permanent access with no login. On native that is
 * mostly hidden — the app is installed, state is local, and the user signed in
 * at some point. On the PWA it is a hole: `secureStorage` falls back to
 * AsyncStorage on web (expo-secure-store has no web implementation), which is
 * localStorage. `peptalk-onboarding.isComplete` is therefore user-editable, so
 * a signed-out visitor reached the whole app, and `peptalk-subscription.tier`
 * read as Pro without any server-backed session.
 *
 * Server-side entitlement still gates the expensive surfaces (the AI edge
 * functions return 403 for an unentitled user), so a locally-forged tier does
 * not buy real compute — but it should never have got past the front door.
 */

export interface RouteGuardState {
  /** Onboarding questionnaire finished. */
  isComplete: boolean;
  /** The auth store has finished rehydrating from storage. */
  authHydrated: boolean;
  /** There is a live Supabase session. */
  isAuthenticated: boolean;
  /** Current route is the onboarding flow. */
  inOnboarding: boolean;
  /** Current route is the auth (sign in / sign up) flow. */
  inAuth: boolean;
}

/** Where to send the visitor, or null to leave them where they are. */
export type RouteGuardDecision = '/onboarding' | '/auth' | null;

export function decideRoute(s: RouteGuardState): RouteGuardDecision {
  // 1. Onboarding first. Auth is reachable too, because the onboarding flow
  //    hands off to sign-up at the end.
  if (!s.isComplete) {
    return s.inOnboarding || s.inAuth ? null : '/onboarding';
  }

  // 2. Never redirect on the strength of a not-yet-rehydrated auth store.
  //    Deliberately NOT the shared hydrationReady flag, which ORs in an 8s
  //    timeout — on a slow rehydrate that would bounce genuinely signed-in
  //    users to /auth and force them to log in again. Worst case here is a
  //    brief delay, not a spurious logout.
  if (!s.authHydrated) return null;

  // 3. Onboarded but signed out — the front door.
  if (!s.isAuthenticated) {
    return s.inAuth || s.inOnboarding ? null : '/auth';
  }

  // 4. Onboarded and signed in: everything is allowed.
  return null;
}
