/**
 * What to say when a session disappeared on its own.
 *
 * THE FAILURE THIS DESCRIBES
 * App Review 2.1(a), twice: "sent back to the login page after logging in",
 * both times on a clean install. `src/lib/routeGuard.ts` is provably loop-free
 * and was not the cause either time. The actual sequence:
 *
 *   1. sign in — useAuthStore goes `isAuthenticated: true`
 *   2. the session write does not stick. On web that is localStorage being
 *      unavailable (private mode, blocked site data, some standalone PWA
 *      contexts) and the session falling back to an in-memory store that dies
 *      with the tab. On native it is a SecureStore write that threw.
 *   3. `getSession()` comes back with no user
 *   4. the store clears the user — correct; a ghost session means every authed
 *      call 401s
 *   5. routeGuard rule 3 (onboarded, signed out) sends them to /auth
 *   6. they sign in again, and it happens again
 *
 * Every step of that is individually right. The loop is silent because no step
 * owns the job of saying so. `sessionPersistenceHealthy()` has carried a doc
 * comment since it was written claiming "the app uses it to warn the user"; the
 * only consumer was a Sentry `extra` field, so the one person who could not see
 * it was the user.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It does not stop the redirect. A session that cannot be verified must not
 * grant access — that hole was closed on 2026-09-12 and reopening it to soften
 * a loop would trade a confusing screen for a real one. The loop stays; it just
 * stops being mute.
 *
 * DRAFT COPY — Edward approves the words.
 */

export type SessionLostReason = 'storage_blocked' | 'unexplained';

export interface SessionLostNotice {
  title: string;
  body: string;
  /** True when signing in again will work but still not survive a reload. */
  willRecur: boolean;
}

/**
 * Pick the message.
 *
 * `persistenceHealthy` is `sessionPersistenceHealthy()` at the moment of the
 * loss. When it is false we know exactly what went wrong and can say it. When
 * it is true we do not, and the copy says that rather than inventing a cause —
 * telling someone their browser is blocking storage when it is not sends them
 * to change a setting that was never the problem.
 */
export function sessionLostNotice(persistenceHealthy: boolean): SessionLostNotice {
  if (!persistenceHealthy) {
    return {
      title: "We couldn't keep you signed in",
      body:
        "This device is blocking the storage we use to remember your session — " +
        "usually private browsing, or site data turned off. You can sign in " +
        "again and everything will work, but you'll be signed out when the app " +
        'reloads. Turning site data back on, or opening PepTalk outside private ' +
        'browsing, fixes it for good.',
      willRecur: true,
    };
  }

  return {
    title: 'You were signed out unexpectedly',
    body:
      "Your session ended on its own rather than because you signed out. Signing " +
      'in again should hold. If it keeps putting you back here, email ' +
      'support@peptalk.bio and we will get you in.',
    willRecur: false,
  };
}

/** True when there is a loss worth reporting to the person in front of us. */
export function shouldShowSessionLost(sessionLostAt: number | null): boolean {
  return typeof sessionLostAt === 'number' && sessionLostAt > 0;
}
