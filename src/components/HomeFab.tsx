/**
 * HomeFab — floating "back to Home" button mounted globally so users
 * can always get back to the dashboard with one tap from anywhere.
 *
 * Wave 76.45: tester feedback — "home button on every page is needed
 * literally every[where]". Deep modal flows (pantry scan, food
 * scanner, lab interpretation, settings sub-pages) previously offered
 * only a chevron-back, which is fine for a one-step pop but useless
 * if the user has drilled three levels deep and wants out.
 *
 * Hidden on:
 *   - The home tab itself (would route to current page)
 *   - The auth + onboarding flows (no tab bar context yet)
 *   - The Aimee tab (deliberately a focus surface — no nav chrome)
 *   - Full-screen modals where a Home button would be confusing
 *     (workout player, video player, paywall, etc.)
 *
 * Positioned bottom-left — the one free corner (Profile is top-right,
 * Aimee is bottom-right) — so it can never collide with the header back
 * chevron (top-left). The earlier top-left placement blocked the back
 * button on any screen the hide-list missed (e.g. the stack builder),
 * which testers reported repeatedly across builds 55/56/59. Moving it
 * off the top edge means we no longer need to hide the FAB on every
 * V3DetailShell route just to avoid the collision.
 */

import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../hooks/useTheme';

// Pathnames where the Home FAB should NOT render. Match by prefix.
//
// Kept deliberately in lockstep with GlobalAimeeFab's HIDDEN_PREFIXES so
// the two read as a matched bottom-corner pair — Home bottom-left, Aimee
// bottom-right — appearing together on exactly the same screens. The long
// list of V3DetailShell detail routes (/nutrition, /labs, /profile, …)
// that used to live here existed ONLY to keep the old top-left FAB from
// covering each screen's top-left back chevron. Now that the FAB sits
// bottom-left it can't collide with the back button, so those routes are
// no longer hidden — which restores a Home button on the profile and
// detail screens where testers reported getting stranded.
const HIDDEN_PREFIXES = [
  '/auth',
  '/sign-in',
  '/sign-up',
  '/welcome',
  '/onboarding',
  '/peptalk',          // Aimee chat — its header carries its own Home button
  '/workouts/player',  // workout player is a focus surface
  '/workouts/program', // program day session
  '/subscription',     // paywall — don't let users escape mid-purchase flow
];

// Exact-path matches where the FAB hides (home, modals).
const HIDDEN_EXACT = new Set([
  '/',
  '/(tabs)',
  '/(tabs)/',
  '/(tabs)/index',
]);

export function HomeFab() {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return null;
  if (HIDDEN_EXACT.has(pathname)) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 18 }]}
    >
      <TouchableOpacity
        onPress={() => router.push('/(tabs)' as never)}
        accessibilityRole="button"
        accessibilityLabel="Go to Home"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[
          styles.button,
          { backgroundColor: t.glassElevated, borderColor: t.glassElevatedBorder },
        ]}
        activeOpacity={0.7}
      >
        <Ionicons name="home" size={18} color={t.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    // Bottom-left, mirroring the Aimee FAB (bottom-right). `bottom` is set
    // inline from safe-area insets so it clears the home indicator / nav
    // bar. Being off the top edge means it never overlaps a screen's own
    // top-left back chevron — the collision testers kept reporting.
    left: 18,
    zIndex: 30,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Soft glass shadow to lift off any background. Same shape as
    // ProfileShortcutFab so the two read as a matched pair when both
    // appear on the same screen.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
});
