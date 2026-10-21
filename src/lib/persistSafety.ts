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
 * 2. It does NOT also add a `migrate` to every store, and an earlier version of
 *    this file did, on a premise that was simply wrong. The claim was that a
 *    `version` bump without `migrate` strands the store unhydrated forever.
 *    It does not: middleware.js:410 returns `[false, undefined]` on that path,
 *    merge falls back to the defaults and `hasHydrated` is set. Verified by
 *    reading it and by running it — bump without migrate DISCARDS the persisted
 *    state and hydrates defaults, which is a useful thing for a bump to mean.
 *
 *    Installing a pass-through migrate everywhere would have quietly changed
 *    that to "the bump does nothing", in 35 stores, while the comment next to
 *    it claimed to be preventing a hang that cannot happen. A store that needs
 *    to carry old data across a bump writes its own migrate; three already do.
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
 *
 * TWO LIMITS WORTH KNOWING
 * It checks the TOP LEVEL only. `{"profile":{"medical":{"conditions":"x"}}}`
 * passes, and `profile.medical.conditions.some(...)` still throws. Stores with
 * deep persisted objects — useHealthProfileStore, useMealStore — defend their
 * own interiors or do not.
 *
 * And zustand calls `merge` with `get() ?? configResult` (middleware.js:417),
 * which is the LIVE state, not the initial state. On first hydrate those are the
 * same thing and nothing in this app calls `persist.rehydrate()`, so "compared
 * against the store's defaults" is true today. It stops being true the moment a
 * `set()` lands before the storage read resolves.
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
 * `unknown` on the DEFAULT side means we cannot tell — a default of `null`
 * (`user: null`, `expiresAt: null`) says nothing about what belongs there — so
 * the persisted value is accepted. Refusing it would wipe every nullable field
 * in the app on first launch after this shipped.
 *
 * `unknown` on the CANDIDATE side is refused; see the note at that line.
 */
export function shapeCompatible(candidate: unknown, fallback: unknown): boolean {
  const want = shapeOf(fallback);
  if (want === 'unknown') return true;

  const got = shapeOf(candidate);

  // `null` against a non-null default is REFUSED, and this is the case that
  // matters most rather than an edge case.
  //
  // An earlier version of this accepted it, reasoning that "not set yet"
  // cannot cause a `.map is not a function`. It causes
  // `TypeError: Cannot read properties of null (reading 'length')` instead,
  // which lands in exactly the same place — `doses.length` in DoseHeatmap,
  // `pendingDeletions.filter` in useChatStore — and blanks the app the same way.
  //
  // Worse, `null` is the ONLY corrupt value JSON.stringify itself emits:
  // NaN and Infinity both serialise to null, and undefined inside an array
  // does too. A bad write is likelier to produce null than anything else, so
  // this was a hole in precisely the failure this module exists to close.
  //
  // Nothing is lost by refusing it. Every persisted key in the app that can
  // legitimately hold null — user, activePlan, activeChatId, expiresAt,
  // productId, pushToken and the rest — has a null DEFAULT, so `want` is
  // 'unknown' for those and they never reach this line. And where a default
  // is an array, falling back to `[]` instead of null is not data loss:
  // null was never data.
  if (got === 'unknown') return false;
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
  /**
   * Keys whose current value is a FUNCTION — storage tried to replace an action.
   *
   * Its own bucket rather than `unknown`, because the two mean opposite things.
   * An unknown key is what a removed field looks like on the first launch after
   * it was removed, and needs no alarm. A blob reaching for `addDose` is not
   * something this app ever wrote.
   */
  actions: string[];
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
  const report: SafeMergeReport = { dropped: [], unknown: [], actions: [] };

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
      report.actions.push(key);
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
    if (report.dropped.length || report.unknown.length || report.actions.length) {
      onProblem?.(storeName, report);
    }
    return merged;
  };
}

