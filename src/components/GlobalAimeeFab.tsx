/**
 * GlobalAimeeFab — pathname-aware mount of the AimeeFAB so the
 * bottom-right "A" button appears on every screen, not just the
 * v3 home + v3 detail shells.
 *
 * Wave 76.52: tester ask — "aimee and logo button on every page,
 * make life easy for navigation." HomeFab (Wave 76.45) already
 * covers the top-left home button globally; this is the matching
 * bottom-right Aimee shortcut.
 *
 * Hidden on:
 *   - The Aimee chat itself (`/peptalk`) — already there
 *   - Unauthenticated routes (auth, onboarding, welcome)
 *   - Focus surfaces where a FAB would distract (workout player,
 *     program day, paywall)
 *
 * IMPORTANT: keep the local <AimeeFAB /> mounts out of any screen
 * the global mount covers. Two FABs on one screen will visibly
 * stack.
 */

import React from 'react';
import { usePathname } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { AimeeFAB } from './v3/AimeeFAB';

const HIDDEN_PREFIXES = [
  '/auth',
  '/sign-in',
  '/sign-up',
  '/welcome',
  '/onboarding',
  '/peptalk',          // Aimee tab — already the chat surface
  '/workouts/player',  // focus surface
  '/workouts/program', // focus surface
  '/subscription',     // paywall — don't compete for attention
];

const HIDDEN_EXACT = new Set<string>([
  // Keep the home tab's local mount (Aimee FAB is part of its layout).
  // If we add this here it gets a global FAB instead. Today the local
  // mount is removed so we keep the global; if home re-adds a local
  // mount, also add '/' / '/(tabs)' to this set.
]);

export function GlobalAimeeFab() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return null;
  if (HIDDEN_EXACT.has(pathname)) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return <AimeeFAB />;
}
