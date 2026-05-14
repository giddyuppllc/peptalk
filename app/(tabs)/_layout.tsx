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

// Tab order — Jamie wants peptides before nutrition (peps come first since the
// app is peptide-led). Aimee anchors the center.
//
// 6 tabs is at the upper end of what fits comfortably on iPhone SE-class
// screens. Tab font is dropped to 9.5 + label margin tightened in the
// styles below to give each tab ~62px on a 375px-wide screen without
// clipping. On Pro / Pro Max the layout breathes more.
const TAB_CONFIG: TabConfig[] = [
  {
    name: 'index',
    title: 'Home',
    icon: 'home-outline',
    activeIcon: 'home',
  },
  {
    name: 'my-stacks',
    title: 'Peptides',
    icon: 'flask-outline',
    activeIcon: 'flask',
  },
  {
    name: 'peptalk',
    title: 'Aimee',
    icon: 'chatbubbles-outline',
    activeIcon: 'chatbubbles',
  },
  {
    name: 'community',
    title: 'Community',
    icon: 'people-outline',
    activeIcon: 'people',
  },
  {
    name: 'nutrition',
    title: 'Nutrition',
    icon: 'nutrition-outline',
    activeIcon: 'nutrition',
  },
  {
    name: 'workouts',
    title: 'Workouts',
    icon: 'barbell-outline',
    activeIcon: 'barbell',
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
        tabBarActiveTintColor: accent.deep,
        tabBarInactiveTintColor: t.textSecondary,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: t.tabBar,
            borderTopColor: t.glassBorder,
            height: tabBarHeight,
            paddingBottom: Math.max(insets.bottom, 6),
          },
        ],
        tabBarLabelStyle: styles.tabBarLabel,
        // Slightly smaller icons so 6 tabs fit comfortably on iPhone SE width.
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
      {/* Hidden tabs — still routable but not in tab bar */}
      <Tabs.Screen name="stack-builder" options={{ href: null }} />
      <Tabs.Screen name="check-in" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
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
  // Smaller label so all 6 tabs fit horizontally on iPhone SE-class widths
  // without label truncation. Pro / Pro Max have more breathing room.
  tabBarLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginTop: 2,
  },
});
