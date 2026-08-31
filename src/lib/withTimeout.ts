/**
 * Bound a promise in wall-clock time.
 *
 * Written for the auth calls, where the absence of a timeout is a user-visible
 * bug rather than a theoretical one.
 *
 * `signInWithPassword` was awaited with nothing bounding it, and the Supabase
 * client sets no fetch timeout. On a half-connected network — hotel wifi, a
 * captive portal, a Meta in-app browser, an emulator dropping half its packets,
 * which is how this was found — the request neither resolves nor rejects. The
 * user taps Log In and *nothing happens*. No spinner ending, no error, still on
 * the login screen.
 *
 * That is, word for word, the App Review 2.1(a) report: "redirected back to the
 * login page after logging in." It also matches Sentry PEPTALK-3, where five
 * users produced fifty-three events — roughly ten attempts each, which is what
 * tapping a button that does nothing looks like.
 *
 * A rejection the UI can explain always beats a promise that hangs.
 */

/** Thrown when the operation outlived its budget. Classified as `offline`. */
export class TimeoutError extends Error {
  readonly ms: number;
  constructor(ms: number, label?: string) {
    // The message is matched by classifyAuthError's network patterns, so a
    // timeout surfaces as the "check your connection" copy rather than as an
    // unhelpful generic. Keep the words "timed out" in it.
    super(`${label ?? 'Request'} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.ms = ms;
  }
}

/**
 * Resolve with `promise`, or reject with TimeoutError after `ms`.
 *
 * The underlying request is NOT cancelled — supabase-js exposes no abort
 * signal, so cancelling would mean reaching past its API. It is left to settle
 * and be ignored, which is safe here: a late-arriving sign-in writes no state
 * because the caller has already taken the error path.
 */
export function withTimeout<T>(
  // PromiseLike, not Promise: supabase-js query builders are thenables rather
  // than real Promises, and typing this as Promise<T> makes T infer as unknown
  // at every call site.
  promise: PromiseLike<T>,
  ms: number,
  label?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Budget for an interactive auth call.
 *
 * 20s is deliberately generous — a slow-but-working connection must not be cut
 * off, because a false timeout on a request that would have succeeded is worse
 * than the hang it replaces. It only needs to beat "forever".
 */
export const AUTH_TIMEOUT_MS = 20_000;
