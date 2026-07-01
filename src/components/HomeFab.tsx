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
 * Positioned top-left so it doesn't collide with ProfileShortcutFab
 * (top-right) or the existing back chevron in screen headers.
 */

import React from 'react';
import { TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../hooks/useTheme';

// Pathnames where the Home FAB should NOT render. Match by prefix.
const HIDDEN_PREFIXES = [
  '/auth',
  '/sign-in',
  '/sign-up',
  '/welcome',
  '/onboarding',
  '/peptalk',          // Aimee tab — keep nav chrome out of focus surface
  '/workouts/player',  // workout player is a focus surface
  '/workouts/program', // program day session
  '/subscription',     // paywall — don't let users escape mid-purchase flow
  // V3DetailShell screens render their own top-left back button; the
  // Home FAB (also top-left) would overlap it. Hide the FAB on those
  // detail routes so the two controls never collide.
  '/nutrition',
  '/activity',
  '/doses',
  '/tracker',
  '/labs',
  '/body-composition',
  '/aimee',
  '/community/milestones',
  '/community/leaderboard',
  '/profile',          // profile tab has its own back button; subpages use V3DetailShell
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return null;
  if (HIDDEN_EXACT.has(pathname)) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
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
    // Mirror ProfileShortcutFab's top-right placement on the opposite
    // side. The 50px top inset clears the OS status bar on both iOS
    // and Android without depending on the screen's own SafeAreaView.
    top: Platform.OS === 'ios' ? 56 : 36,
    left: 12,
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
