/**
 * Lightweight telemetry facade.
 *
 * The app's error-logging currently writes to `console.warn/error` in DEV
 * only. This file centralizes those calls behind a stable API so we can
 * drop in Sentry / Bugsnag / any other crash reporter later by editing
 * ONE file instead of grepping for `console.warn` across the codebase.
 *
 * To wire up Sentry once installed:
 *
 *   // 1. npm install @sentry/react-native
 *   // 2. Run `npx sentry-wizard` once and paste the DSN into your .env as
 *   //    EXPO_PUBLIC_SENTRY_DSN=...
 *   // 3. Replace the bodies below with `Sentry.captureException(e)` etc.
 *   // 4. In _layout.tsx top-level: `import './src/services/telemetry';`
 *      runs `initTelemetry()` which reads the DSN and calls `Sentry.init`.
 *
 * Until then everything is a no-op in production, console-forwarded in dev.
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

let _initialized = false;

export function initTelemetry(): void {
  if (_initialized) return;
  _initialized = true;
  if (!DSN) {
    if (__DEV__) console.log('[telemetry] no DSN configured; running in no-op mode');
    return;
  }
  // Placeholder for Sentry.init({ dsn: DSN, ... }) — see file header.
  if (__DEV__) console.log('[telemetry] DSN present but Sentry not wired yet');
}

export function isEnabled(): boolean {
  return _initialized && !!DSN;
}

/** Report an unhandled exception with optional context tags. */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (__DEV__) {
    console.warn('[telemetry:exception]', err, context ?? {});
  }
  // TODO(sentry): Sentry.captureException(err, { extra: context });
}

/** Report a non-fatal message (e.g. "subscription sync gave up after 3 retries"). */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'warning',
  context?: Record<string, unknown>,
): void {
  if (__DEV__) {
    console.warn(`[telemetry:${level}]`, message, context ?? {});
  }
  // TODO(sentry): Sentry.captureMessage(message, { level, extra: context });
}

/** Attach breadcrumbs for context on the next captured event. */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  // TODO(sentry): Sentry.addBreadcrumb({ category, message, data });
  if (__DEV__) {
    console.log(`[telemetry:breadcrumb] ${category}:`, message, data ?? '');
  }
}

/** Set the active user so captured events can be grouped per-user. */
export function setUser(user: { id: string; email?: string } | null): void {
  // TODO(sentry): Sentry.setUser(user);
  if (__DEV__) console.log('[telemetry] setUser', user?.id ?? null);
}
