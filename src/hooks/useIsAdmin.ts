/**
 * useIsAdmin — small client-side check for whether the signed-in user
 * is on the admin allow-list.
 *
 * Server-side ADMIN_EMAILS env is the authoritative gate (every admin
 * edge function re-checks). This hook just hides admin UI affordances
 * from non-admin users so we don't show them paths that will 403.
 *
 * Update this list when you add or remove admins. Keep in lockstep
 * with the ADMIN_EMAILS Supabase secret.
 */

import { useAuthStore } from '../store/useAuthStore';

const ADMIN_EMAILS_LOWER: string[] = [
  'edward@giddyupp.com',
];

export function useIsAdmin(): boolean {
  const email = useAuthStore((s) => s.user?.email);
  if (!email) return false;
  return ADMIN_EMAILS_LOWER.includes(email.toLowerCase());
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS_LOWER.includes(email.toLowerCase());
}
