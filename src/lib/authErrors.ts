/**
 * Turn an auth failure into something a user can act on.
 *
 * Motivation — Sentry PEPTALK-3: `NetworkError` on app.peptalk.bio/onboarding,
 * 53 events across 5 users. Ten attempts each. Both `app/onboarding.tsx` and
 * `app/auth.tsx` rendered `err.message` directly, so what those people saw was
 * "Failed to fetch" or "Network request failed" — accurate, meaningless, and
 * offering no idea whether to retry, check their connection, or give up. So
 * they retried. Ten times.
 *
 * Surfacing the raw message was itself a deliberate earlier fix (silent catches
 * had hidden a login-vs-signup bug for weeks), and that instinct was right — the
 * error must not be swallowed. This keeps the real message for telemetry and
 * replaces only the USER-FACING string, and only for the cases where we can say
 * something more useful than the library did.
 *
 * Kept free of React and React Native imports so it can be unit-tested directly.
 */

export type AuthErrorKind =
  | 'offline'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'already_registered'
  | 'weak_password'
  | 'server'
  | 'unknown';

export interface DescribedAuthError {
  /** What to show the user. */
  message: string;
  /** Classification, for Sentry tagging and for callers that branch. */
  kind: AuthErrorKind;
  /** The original message, preserved for telemetry. Never shown as-is. */
  raw: string;
  /** Whether trying again, unchanged, could plausibly work. */
  retryable: boolean;
}

/**
 * Network-failure shapes seen across the surfaces we ship on. supabase-js does
 * not normalise these — the browser, React Native's fetch polyfill and
 * gotrue-js each phrase it differently, and an in-app browser (Instagram,
 * Facebook) adds its own. Matching on text is unlovely but it is the only
 * signal that survives all four.
 */
const NETWORK_PATTERNS = [
  'failed to fetch',
  'network request failed',
  'networkerror',
  'network error',
  'load failed',            // Safari / iOS WebKit
  'the internet connection appears to be offline',
  'fetch failed',
  'err_internet_disconnected',
  'aborterror',
  'timeout',
  'timed out',
];

const norm = (s: string) => s.toLowerCase();

export function classifyAuthError(err: unknown): AuthErrorKind {
  const raw = extractMessage(err);
  const m = norm(raw);
  const status = (err as { status?: number } | null)?.status;

  if (NETWORK_PATTERNS.some((p) => m.includes(p))) return 'offline';
  if (m.includes('email not confirmed') || m.includes('email_not_confirmed')) {
    return 'email_not_confirmed';
  }
  if (m.includes('already registered') || m.includes('already been registered') ||
      m.includes('user already exists')) {
    return 'already_registered';
  }
  if (m.includes('invalid login credentials') || m.includes('invalid credentials') ||
      m.includes('invalid email or password')) {
    return 'invalid_credentials';
  }
  if (m.includes('password') && (m.includes('short') || m.includes('weak') ||
      m.includes('at least'))) {
    return 'weak_password';
  }
  if (status === 429 || m.includes('rate limit') || m.includes('too many requests') ||
      m.includes('for security purposes')) {
    return 'rate_limited';
  }
  if (typeof status === 'number' && status >= 500) return 'server';
  return 'unknown';
}

const MESSAGES: Record<AuthErrorKind, string> = {
  // Names the two things the user can actually check. Deliberately does not say
  // "you are offline" — the request may equally have been blocked by an in-app
  // browser, which is a live suspicion for this error given the Meta in-app
  // browser traffic we see in the CSP reports.
  offline:
    "We couldn't reach PepTalk. Check your connection and try again — if you opened " +
    'this from a link inside another app, try opening it in Safari or Chrome instead.',
  invalid_credentials: 'Invalid email or password.',
  email_not_confirmed:
    'Confirm your email first — tap the link we sent you, then sign in.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  already_registered:
    'That email already has an account. Sign in instead, or reset your password.',
  weak_password: 'Choose a longer password.',
  server: 'PepTalk is having trouble right now. Please try again in a moment.',
  unknown: 'Something went wrong. Please try again.',
};

/** Kinds where retrying the identical request could plausibly succeed. */
const RETRYABLE: ReadonlySet<AuthErrorKind> = new Set<AuthErrorKind>([
  'offline',
  'rate_limited',
  'server',
]);

export function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  return '';
}

export function describeAuthError(err: unknown): DescribedAuthError {
  const raw = extractMessage(err);
  const kind = classifyAuthError(err);
  return {
    kind,
    raw,
    message: MESSAGES[kind],
    retryable: RETRYABLE.has(kind),
  };
}
