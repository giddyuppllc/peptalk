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
  /**
   * Current route is /set-password — the step a password-reset link lands on.
   *
   * Added 2026-09-16. `postAuthLinkRoute` sends EVERY recovery link to
   * /set-password whatever the onboarding state (passwordRecovery.ts:54), and
   * rule 1 below then evicted it to /onboarding whenever `isComplete` was
   * false. That is not a rare state on this flow — it is the normal one. A
   * reset link is what someone opens on a new phone or after a reinstall, and
   * on a fresh install `isComplete` is false until restoreOnboardingFromServer
   * finds a snapshot on the server. For an account with no snapshot there is
   * nothing to find, so it stays false: the link established a session, the
   * screen mounted, and the guard pulled the user into onboarding before they
   * could type a password.
   *
   * docs/app-store-review-notes-additions-2026-09-16.md §2 states that the
   * REVIEWER account is exactly such an account — created before the restore
   * existed, no stored onboarding record — so "Forgot password" silently did
   * nothing for the one account App Review uses.
   *
   * Only rule 1 changes. A signed-OUT visitor is still sent to /auth by rule 3,
   * which is right: /set-password needs the session the link grants, and
   * app/set-password.tsx sends a sessionless visitor to /auth itself.
   */
  inPasswordRecovery: boolean;
}

/** Where to send the visitor, or null to leave them where they are. */
export type RouteGuardDecision = '/onboarding' | '/auth' | null;

export function decideRoute(s: RouteGuardState): RouteGuardDecision {
  // 1. Onboarding first. Auth is reachable too, because the onboarding flow
  //    hands off to sign-up at the end — and so is /set-password, because a
  //    password-reset link lands there before onboarding can possibly be
  //    complete on a fresh install. See `inPasswordRecovery` above.
  if (!s.isComplete) {
    return s.inOnboarding || s.inAuth || s.inPasswordRecovery ? null : '/onboarding';
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
