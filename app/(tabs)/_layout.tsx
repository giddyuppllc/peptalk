import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { selectionTick } from '../../src/utils/haptics';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { AimeeDnaIcon } from '../../src/components/AimeeDnaIcon';
import { ProfileShortcutFab } from '../../src/components/ProfileShortcutFab';

type TabIconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
  name: string;
  title: string;
  icon: TabIconName;
  activeIcon: TabIconName;
}

// Tab order (5 tabs — restructured 2026-05-16 per user direction):
//
//   Home  ·  Train  ·  Aimee  ·  Peptides  ·  Profile
//
// Train is the new unified surface — Nutrition + Workouts merged into one
// landing screen with 4 big buttons (Log Workout / Log Meal / Jamie's
// Program / Your Workouts). Community moves off the bottom bar into a
// card inside Profile. Profile gets promoted from the hidden routes list
// to a primary tab.
const TAB_CONFIG: TabConfig[] = [
  {
    name: 'index',
    title: 'Home',
    icon: 'home-outline',
    activeIcon: 'home',
  },
  {
    name: 'train',
    title: 'Train',
    icon: 'fitness-outline',
    activeIcon: 'fitness',
  },
  {
    name: 'peptalk',
    title: 'Aimee',
    icon: 'chatbubbles-outline',
    activeIcon: 'chatbubbles',
  },
  {
    name: 'my-stacks',
    title: 'Peptides',
    icon: 'flask-outline',
    activeIcon: 'flask',
  },
  {
    name: 'profile',
    title: 'Profile',
    icon: 'person-outline',
    activeIcon: 'person',
  },
];

export default function TabsLayout() {
  const t = useTheme();
  const accent = useSectionAccent();
  const insets = useSafeAreaInsets();
  // Modern iPhones (X+) have a 34px home-indicator inset. iOS Pre-X
  // returns 0 here. Build the tab bar to clear the indicator with breathing
  // room — content area 50px + insets.bottom + a tiny floor of 10 so old
  // hardware still has touch targets that meet HIG.
  const tabContent = 50;
  const tabBarHeight = tabContent + Math.max(insets.bottom, 10);
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        // v3.1 §4.1 + §20.1 — "No bottom tab bar (4 cards are the nav)."
        // The Tabs navigator stays so existing routes (peptalk, my-stacks,
        // train, profile) still resolve for deep links + back navigation,
        // but the bar itself is hidden. The v3 home renders the 4 drill
        // cards as the actual navigation surface.
        tabBarStyle: { display: 'none' },
        tabBarActiveTintColor: accent.deep,
        tabBarInactiveTintColor: t.textSecondary,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: { paddingTop: 4 },
      }}
    >
      {TAB_CONFIG.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, color, size }) =>
              tab.name === 'peptalk' ? (
                // Custom DNA helix glyph for Aimee — glassy translucent
                // blue, swaps the chat-bubble Ionicon.
                <AimeeDnaIcon size={size + 2} color={color} active={focused} />
              ) : (
                <Ionicons
                  name={focused ? tab.activeIcon : tab.icon}
                  size={size}
                  color={color}
                />
              ),
          }}
          listeners={{
            tabPress: () => selectionTick(),
          }}
        />
      ))}
      {/* Hidden tabs — still routable but not in tab bar.
          Nutrition / Workouts / Community moved here after the
          tab restructure 2026-05-16. Train is the new entry
          point that surfaces "Log Meal / Log Workout / Jamie's
          Program / Your Workouts" buttons; existing /(tabs)/
          nutrition and /(tabs)/workouts still resolve so deep
          links from notifications / Aimee actions don't break. */}
      <Tabs.Screen name="stack-builder" options={{ href: null }} />
      <Tabs.Screen name="check-in" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="nutrition" options={{ href: null }} />
      <Tabs.Screen name="workouts" options={{ href: null }} />
      <Tabs.Screen name="community" options={{ href: null }} />
    </Tabs>
    {/* Top-right shortcut menu — hidden on Home; gives one-tap access to
        Profile, Calendar, Check-in, Community from any other tab. */}
    <ProfileShortcutFab />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#F0EEE9',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    // height + paddingBottom are computed dynamically from safe-area
    // insets in the component; the floor here only matters if insets
    // aren't yet resolved on first frame.
    paddingTop: 6,
    elevation: 0,
  },
  // 5 tabs (down from 6) — labels breathe at the normal size now. The
  // previous 9.5px font was a workaround for the 6-tab cram. Bumped to
  // 11 with a slightly looser letter-spacing for better legibility.
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 2,
  },
});
