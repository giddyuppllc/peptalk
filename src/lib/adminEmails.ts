/**
 * The admin allow-list, and the pure predicate over it.
 *
 * Extracted out of `hooks/useIsAdmin.ts` to break a require cycle:
 *
 *     useAuthStore → useIsAdmin → useAuthStore
 *
 * `useAuthStore` only ever wanted `isAdminEmail`, which is a pure string check
 * and has no business reaching for a store. But it lived in the same module as
 * the hook, and the hook subscribes to the store — so importing the predicate
 * dragged the store back in and Metro warned on every launch that the cycle
 * "can result in uninitialized values". Benign today, only because the import
 * is used inside a function body rather than at module scope; a landmine the
 * moment someone moves it.
 *
 * Server-side ADMIN_EMAILS is the authoritative gate — every admin edge
 * function re-checks. This only hides UI that would 403 anyway. Keep it in
 * lockstep with the ADMIN_EMAILS Supabase secret.
 */

export const ADMIN_EMAILS_LOWER: readonly string[] = [
  'edward@giddyupp.com',
  'jamieespositofit@gmail.com',
];

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS_LOWER.includes(email.toLowerCase());
}
