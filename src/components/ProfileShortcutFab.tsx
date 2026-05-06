/**
 * ProfileShortcutFab — small avatar button stuck to the top-right of
 * every tab screen so users can reach Profile / Settings from
 * anywhere, not just the Home tab's avatar.
 *
 * Lives inside the (tabs)/_layout so it overlays Home, Peptides, Aimee,
 * Nutrition, Workouts identically. Hidden on the Home tab itself
 * (the existing inline avatar greeting covers that surface).
 */

import React from 'react';
import { TouchableOpacity, Image, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../hooks/useTheme';

export function ProfileShortcutFab() {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  // Hide on Home (the home tab already has a prominent inline avatar greeting),
  // and on any non-tab route (modals, deep pages, etc.).
  const isHomeTab = pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/';
  if (isHomeTab) return null;

  // Only show inside the tab routes — onboarding, auth, modals etc. shouldn't
  // see this. The tabs route paths all start with /(tabs) or are top-level
  // names like /my-stacks, /peptalk, /nutrition, /workouts (because
  // (tabs) is a route group expo-router strips from URLs).
  const tabRoots = ['/my-stacks', '/peptalk', '/nutrition', '/workouts'];
  const onTabRoot = tabRoots.some((p) => pathname === p || pathname === `${p}/`);
  if (!onTabRoot) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <TouchableOpacity
        onPress={() => router.push('/(tabs)/profile')}
        accessibilityRole="button"
        accessibilityLabel="Open profile and settings"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={[styles.button, { backgroundColor: t.glassElevated, borderColor: t.glassElevatedBorder }]}
        activeOpacity={0.7}
      >
        {user?.avatarUri ? (
          <Image source={{ uri: user.avatarUri }} style={styles.avatar} />
        ) : (
          <Ionicons name="person" size={16} color={t.text} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    right: 14,
    zIndex: 100,
    elevation: 100,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  avatar: { width: 28, height: 28, borderRadius: 14 },
});

export default ProfileShortcutFab;
