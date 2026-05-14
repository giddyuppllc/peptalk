/**
 * ProfileShortcutFab — top-right overflow menu mounted across every tab
 * screen so Profile, Calendar, Check-in, and Community are reachable
 * from anywhere, not just the Home avatar.
 *
 * Tap the avatar/icon to open a small popover with shortcuts. Tapping
 * outside the popover (the transparent overlay) dismisses it.
 *
 * Hidden on the Home tab — Home already has a prominent inline avatar
 * + greeting that exposes the same actions.
 */

import React, { useState } from 'react';
import {
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  View,
  Text,
  StyleSheet,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../hooks/useTheme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
  label: string;
  icon: IoniconName;
  href: string;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Profile',   icon: 'person-circle-outline',  href: '/(tabs)/profile' },
  { label: 'Check-in',  icon: 'checkmark-circle-outline', href: '/(tabs)/check-in' },
  { label: 'Calendar',  icon: 'calendar-outline',        href: '/(tabs)/calendar' },
  { label: 'Community', icon: 'people-outline',          href: '/community' },
];

export function ProfileShortcutFab() {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  // Hide on Home (the home tab already has a prominent inline avatar greeting),
  // and on any non-tab route (modals, deep pages, etc.).
  const isHomeTab = pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/';
  if (isHomeTab) return null;

  // Only show inside the tab routes — onboarding, auth, modals etc. shouldn't
  // see this. The tabs route paths all start with /(tabs) or are top-level
  // names like /my-stacks, /peptalk, /nutrition, /workouts (because
  // (tabs) is a route group expo-router strips from URLs).
  const tabRoots = ['/my-stacks', '/peptalk', '/community', '/nutrition', '/workouts'];
  const onTabRoot = tabRoots.some((p) => pathname === p || pathname === `${p}/`);
  if (!onTabRoot) return null;

  const goTo = (href: string) => {
    setOpen(false);
    router.push(href as any);
  };

  return (
    <>
      <View pointerEvents="box-none" style={styles.wrap}>
        <TouchableOpacity
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open shortcuts menu"
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

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.menu,
                  {
                    backgroundColor: t.card,
                    borderColor: t.cardBorder,
                  },
                ]}
              >
                {MENU_ITEMS.map((item, idx) => (
                  <TouchableOpacity
                    key={item.href}
                    onPress={() => goTo(item.href)}
                    style={[
                      styles.menuItem,
                      idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.cardBorder },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <Ionicons name={item.icon} size={18} color={t.text} />
                    <Text style={[styles.menuItemText, { color: t.text }]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  menu: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 96 : 64,
    right: 14,
    minWidth: 200,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ProfileShortcutFab;
