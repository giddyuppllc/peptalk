import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { selectionTick } from '../../src/utils/haptics';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
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
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: accent.deep,
          tabBarInactiveTintColor: t.textSecondary,
          tabBarStyle: [styles.tabBar, {
            backgroundColor: t.tabBar,
            borderTopColor: t.glassBorder,
          }],
          tabBarLabelStyle: styles.tabBarLabel,
        }}
      >
        {TAB_CONFIG.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarIcon: ({ focused, color, size }) => (
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
      {/* Top-right profile shortcut overlay — visible on all non-Home tabs. */}
      <ProfileShortcutFab />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#F0EEE9',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingBottom: 6,
    paddingTop: 8,
    height: 65,
    elevation: 0,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 2,
  },
});
