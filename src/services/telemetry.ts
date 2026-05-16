/**
 * Telemetry facade — Sentry-backed in production, console in dev.
 *
 * Wave 76.11 replaced the no-op stub with a real `@sentry/react-native`
 * integration. The SDK is lazy-required inside `initTelemetry()` so the
 * native module doesn't load when no DSN is configured (e.g. local
 * dev without the env var set, or contributors without Sentry access).
 *
 * Behavior matrix:
 *
 *   DSN set      __DEV__       Sentry init   captureException
 *   ─────────────────────────────────────────────────────────
 *   yes          true          ✓             Sentry + console
 *   yes          false         ✓             Sentry only
 *   missing      true          ✗             console only
 *   missing      false         ✗             silent (no-op)
 *
 * Sensitive-data guard: `beforeSend` strips any `extra.context` keys
 * matching /receipt|token|password|secret|chat|content|profile/i so a
 * future caller can't accidentally ship raw auth tokens / receipts /
 * chat content into Sentry. The list errs on the side of stripping —
 * better to lose context than leak.
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

let _initialized = false;
let _sentry: any = null;

/**
 * Strip PII / sensitive fields from a context object before it reaches
 * Sentry. Conservatively redacts keys that LOOK sensitive — we'd rather
 * over-redact than ship raw chat content or a JWT.
 */
const SENSITIVE_KEY_RE = /receipt|token|password|secret|chat|content|profile|email|jwt|api[_-]?key/i;
function scrubContext(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '[redacted]';
    } else if (typeof v === 'string' && v.length > 2000) {
      // Truncate large strings so we don't ship megabytes of context.
      out[k] = v.slice(0, 2000) + '…[truncated]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function initTelemetry(): void {
  if (_initialized) return;
  _initialized = true;
  if (!DSN) {
    if (__DEV__) console.log('[telemetry] no DSN configured; running in no-op mode');
    return;
  }
  try {
    // Lazy require so we don't pull the SDK + native module when DSN
    // is unset (DEV builds, contributors without Sentry access).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _sentry = require('@sentry/react-native');
    _sentry.init({
      dsn: DSN,
      // Default tracing — Sentry React Native auto-instruments fetch,
      // navigation, and AppState. We keep the sample rate modest to
      // avoid blowing through the free tier on chat-heavy users.
      tracesSampleRate: 0.1,
      // Strip PII at the edge. Sentry SDK still attaches deviceContext
      // / OS info / app version, which is fine.
      beforeSend: (event: any) => {
        if (event?.extra) event.extra = scrubContext(event.extra);
        if (event?.tags) event.tags = scrubContext(event.tags);
        // Drop the user object's email/username, keep just the id.
        if (event?.user) {
          event.user = { id: event.user.id };
        }
        return event;
      },
      // No sending in dev — wizard usually toggles this via
      // EXPO_PUBLIC_SENTRY_ENABLED_IN_DEV, but Edward hasn't set it,
      // so we default to dev-disabled to keep noise out of Sentry
      // while iterating.
      enabled: !__DEV__,
    });
    if (__DEV__) console.log('[telemetry] Sentry initialized');
  } catch (err) {
    if (__DEV__) console.warn('[telemetry] Sentry init failed:', err);
    _sentry = null;
  }
}

export function isEnabled(): boolean {
  return _initialized && !!DSN && !!_sentry;
}

/** Report an unhandled exception with optional context tags. */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (__DEV__) {
    console.warn('[telemetry:exception]', err, context ?? {});
  }
  if (_sentry) {
    try {
      _sentry.captureException(err, { extra: scrubContext(context) });
    } catch { /* never let telemetry crash callers */ }
  }
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
  if (_sentry) {
    try {
      _sentry.captureMessage(message, {
        level,
        extra: scrubContext(context),
      });
    } catch { /* swallow */ }
  }
}

/** Attach breadcrumbs for context on the next captured event. */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (_sentry) {
    try {
      _sentry.addBreadcrumb({
        category,
        message,
        data: scrubContext(data),
      });
    } catch { /* swallow */ }
  }
  if (__DEV__) {
    console.log(`[telemetry:breadcrumb] ${category}:`, message, data ?? '');
  }
}

/** Set the active user so captured events can be grouped per-user. */
export function setUser(user: { id: string; email?: string } | null): void {
  if (_sentry) {
    try {
      // Email/etc. would be sensitive — beforeSend strips it. We send
      // the id so events group correctly by user without leaking PII.
      _sentry.setUser(user ? { id: user.id } : null);
    } catch { /* swallow */ }
  }
  if (__DEV__) console.log('[telemetry] setUser', user?.id ?? null);
}

/**
 * Install a global handler so any unhandled JS exception (including
 * promise rejections that escape every other catch) lands in Sentry.
 * Called once from app/_layout.tsx during the boot sequence.
 */
export function installGlobalErrorHandler(): void {
  // RN provides ErrorUtils on the global object.
  const ErrorUtils = (globalThis as any).ErrorUtils;
  if (!ErrorUtils?.setGlobalHandler || !ErrorUtils?.getGlobalHandler) return;
  const prior = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((err: unknown, isFatal?: boolean) => {
    captureException(err, { isFatal: !!isFatal, source: 'global' });
    if (prior) {
      try { prior(err, isFatal); } catch { /* swallow */ }
    }
  });
}
