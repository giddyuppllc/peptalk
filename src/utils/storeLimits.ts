/**
 * Soft caps on persisted store arrays.
 *
 * Why: expo-secure-store has a ~2MB ceiling per key. A heavy multi-month
 * user logging meals/doses/entries unbounded eventually hits that ceiling
 * and writes start silently failing — corrupting the persist layer in
 * surprising ways. We cap the in-memory arrays at write time and keep
 * the *most recent* N entries.
 *
 * Trade-off: very-old entries get evicted from the device. Server is
 * still source of truth for those (syncFromServer can re-hydrate the
 * tail when needed for analytics). The user's daily / weekly views never
 * need more than the most recent few hundred entries, so the eviction
 * is invisible during normal use.
 *
 * Numbers chosen for ~50% headroom on the 2MB cap with average JSON sizes
 * (~1KB / meal, ~600B / dose, ~1.5KB / journal entry — measured against
 * a representative TestFlight session in March 2026).
 */

export const STORE_LIMITS = {
  /** Meals: ~5/day × 365 = 1825/year. 1000 ≈ 6 months heavy. */
  MEALS: 1000,
  /** Doses: ~3/day × 365 = 1100/year. 1500 ≈ 16 months heavy. */
  DOSES: 1500,
  /** Journal: most users write much less than meals. 800 ≈ many years. */
  JOURNAL_ENTRIES: 800,
  /** Custom meals (user-saved recipes): ~5KB each. 200 ≈ 1MB persisted. */
  CUSTOM_MEALS: 200,
  /** Meal templates (My Meals saved batches): ~5KB each. 200 ≈ 1MB. */
  MEAL_TEMPLATES: 200,
} as const;

/**
 * Cap an already-newest-first array to `max` entries by dropping the tail.
 * Inputs that are already shorter than `max` are returned unchanged
 * (referentially equal — useful for shallow-equality checks).
 */
export function capNewestFirst<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(0, max) : arr;
}
