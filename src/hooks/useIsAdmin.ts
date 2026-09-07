/**
 * useIsAdmin — is the signed-in user on the admin allow-list?
 *
 * The list and the pure predicate live in `src/lib/adminEmails.ts`. They were
 * moved there to break the `useAuthStore → useIsAdmin → useAuthStore` require
 * cycle: `useAuthStore` imports `isAdminEmail`, and this module subscribes to
 * `useAuthStore`, so co-locating them made the store import itself.
 *
 * Server-side ADMIN_EMAILS is the authoritative gate — every admin edge
 * function re-checks. This hook only hides affordances that would 403.
 */

import { useAuthStore } from '../store/useAuthStore';
import { isAdminEmail } from '../lib/adminEmails';

export function useIsAdmin(): boolean {
  const email = useAuthStore((s) => s.user?.email);
  return isAdminEmail(email);
}

// Re-exported so existing importers keep working. New code should import from
// `src/lib/adminEmails` directly — importing it from here pulls in the store.
export { isAdminEmail, ADMIN_EMAILS_LOWER } from '../lib/adminEmails';
