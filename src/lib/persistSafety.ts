/**
 * Making a persisted store survive a blob it did not write.
 *
 * TWO FAILURES, BOTH CONFIRMED IN zustand 5.0.14's middleware.js
 *
 * 1. `merge` defaults to `{ ...currentState, ...persistedState }` (line 337).
 *    No validation of any kind. Whatever is in storage overwrites the default,
 *    including a string where an array belongs — and the first `.filter()` or
 *    `.map()` on it throws. With one error boundary, at the root, that is the
 *    whole app replaced by the fallback screen, on every launch, until the user
 *    reinstalls. It is not hypothetical: on web `secureStorage` falls back to
 *    localStorage, which is user-editable, and a partial write from an app kill
 *    produces the same shape.
 *
 * 2. Bumping `version` without supplying `migrate` does NOT discard the old
 *    state — it logs "couldn't be migrated since no migrate function was
 *    provided", falls out of the branch returning `undefined`, and the next
 *    line destructures it (`const [migrated, migratedState] = migrationResult`).
 *    That throws, the throw is swallowed by the trailing `.catch`, and
 *    `hasHydrated` is never set. The store hydrates never. `useAuthStore`'s
 *    `hasHydrated` gates routing, so that is a permanent stuck screen rather
 *    than a crash. 35 of this repo's 38 persisted stores declared no version at
 *    all, so the first person to add one would have found this the hard way.
 *
 * WHAT THIS DOES NOT DO
 * It does not validate values, only their shape, and only against the store's
 * own defaults. A dose of -5 is still a dose of -5. Shape is the part that
 * throws; meaning is the store's own business, and a helper that started
 * guessing at meaning would quietly delete real user data to satisfy a rule
 * nobody wrote down.
 *
 * It is also deliberately conservative in one direction only: every rejection
 * falls back to the store's default. It can drop a key. It can never invent one.
 */

/** Categories that behave differently enough that swapping them throws. */
type ShapeKind = 'array' | 'object' | 'string' | 'number' | 'boolean' | 'unknown';

function shapeOf(v: unknown): ShapeKind {
  if (Array.isArray(v)) return 'array';
  if (v === null || v === undefined) return 'unknown';
  const t = typeof v;
  if (t === 'object') return 'object';
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'unknown';
}

/**
 * Is `candidate` safe to use where `fallback` is the default?
 *
 * `unknown` on the default side means we cannot tell — a default of `null`
 * (`user: null`, `expiresAt: null`) says nothing about what belongs there — so
 * the persisted value is accepted. Refusing it would wipe every nullable field
 * in the app on first launch after this shipped.
 */
export function shapeCompatible(candidate: unknown, fallback: unknown): boolean {
  const want = shapeOf(fallback);
  if (want === 'unknown') return true;

  const got = shapeOf(candidate);
  // A null/undefined persisted value is a legitimate "not set yet" for any
  // default. It cannot be the cause of a `.map is not a function`.
  if (got === 'unknown') return true;
  if (got !== want) return false;

  // NaN and Infinity survive JSON round-trips as null, but a hand-edited
  // localStorage entry or a bad migration can still put one here, and they
  // poison every arithmetic path downstream.
  if (want === 'number') return Number.isFinite(candidate as number);
  return true;
}

export interface SafeMergeReport {
  /** Keys dropped because their shape did not match the default. */
  dropped: string[];
  /** Keys present in storage that the store no longer has. */
  unknown: string[];
}

/**
 * Shape-checked replacement for zustand's default `merge`.
 *
 * Keys the store does not declare are dropped rather than carried: they are
 * state nothing reads, written to secure storage forever. `betaUserIds` in
 * useSubscriptionStore was exactly that, for months.
 */
export function safeMergeWithReport<T extends object>(
  persisted: unknown,
  current: T,
): { merged: T; report: SafeMergeReport } {
  const report: SafeMergeReport = { dropped: [], unknown: [] };

  if (persisted === null || typeof persisted !== 'object' || Array.isArray(persisted)) {
    // Not a state object at all. Defaults, in full.
    return { merged: current, report };
  }

  const out: Record<string, unknown> = { ...(current as Record<string, unknown>) };
  const src = persisted as Record<string, unknown>;

  for (const key of Object.keys(src)) {
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      report.unknown.push(key);
      continue;
    }
    // Never let storage replace a function: actions live on the same object as
    // state in zustand, and a persisted string where an action belongs turns
    // every call site into "x is not a function".
    if (typeof (current as Record<string, unknown>)[key] === 'function') {
      report.unknown.push(key);
      continue;
    }
    if (!shapeCompatible(src[key], (current as Record<string, unknown>)[key])) {
      report.dropped.push(key);
      continue;
    }
    out[key] = src[key];
  }

  return { merged: out as T, report };
}

/** The `merge` option itself. `onProblem` is called only when something was refused. */
export function makeSafeMerge<T extends object>(
  storeName: string,
  onProblem?: (storeName: string, report: SafeMergeReport) => void,
): (persisted: unknown, current: T) => T {
  return (persisted, current) => {
    const { merged, report } = safeMergeWithReport(persisted, current);
    if (report.dropped.length || report.unknown.length) {
      onProblem?.(storeName, report);
    }
    return merged;
  };
}

/**
 * The `migrate` option.
 *
 * Carries the old state through unchanged and lets `merge` above decide what is
 * usable. The point is not clever migration — it is that a version bump can
 * never again leave a store unhydrated forever because nobody supplied this.
 *
 * A store with a real transformation to do supplies its own and ignores this.
 */
export function passthroughMigrate(persisted: unknown): unknown {
  return persisted;
}
