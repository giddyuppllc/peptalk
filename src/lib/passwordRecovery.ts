/**
 * Where a Supabase auth deep link should land.
 *
 * app/auth.tsx told the user, twice, that the reset email's link lets them
 * "pick a new password". The link did establish a session — and then
 * app/_layout.tsx routed straight to /(tabs) or /onboarding, the same as a
 * signup confirmation. `auth.updateUser({ password })` existed NOWHERE in the
 * repo, so there was no screen to route to and no call that could have changed
 * a password. The whole feature was a promise with nothing behind it.
 *
 * Pure so the routing rule is testable without a router: the handler in
 * _layout.tsx is 90 lines of URL parsing and session setting, and the one
 * decision that matters is the last line of it.
 */

export type PostAuthRoute = '/set-password' | '/(tabs)' | '/onboarding';

/**
 * Pull the `type` out of a Supabase auth link.
 *
 * It arrives in the QUERY for the OTP flow (`?token_hash=…&type=recovery`) and
 * in the FRAGMENT for the implicit flow, which is the client's current default:
 * `#access_token=…&refresh_token=…&type=recovery`. The existing handler only
 * read `[?&]type=`, so on the implicit flow — the one that actually runs — the
 * type was invisible even before there was anywhere to send it.
 */
export function authLinkType(url: string): string | null {
  const m = url.match(/[?&#]type=([^&#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}

/** True for a link whose whole purpose is to let the user set a new password. */
export function isRecoveryLink(url: string): boolean {
  return authLinkType(url) === 'recovery';
}

/**
 * The route to replace to once a deep link has granted a session.
 *
 * A recovery link goes to the set-password step. Everything else keeps the
 * existing rule exactly: home only when onboarding is really complete —
 * "auth may RESPECT completion, never GRANT it".
 */
export function postAuthLinkRoute(input: {
  recovery: boolean;
  onboardingComplete: boolean;
  hasGender: boolean;
}): PostAuthRoute {
  if (input.recovery) return '/set-password';
  return input.onboardingComplete && input.hasGender ? '/(tabs)' : '/onboarding';
}
