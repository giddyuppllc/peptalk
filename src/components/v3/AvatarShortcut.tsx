/**
 * AvatarShortcut — top-right tappable avatar that routes to /profile.
 *
 * Lives inline in the v3 Greeting row on every screen. Replaces the
 * legacy ProfileShortcutFab on v3 screens (per Phase A spec).
 */

import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { useAuthStore } from '../../store/useAuthStore';
import { tapLight } from '../../utils/haptics';

export function AvatarShortcut() {
  const t = useV3Theme();
  const router = useRouter();
  const firstName = useAuthStore((s) => s.user?.firstName) ?? '';
  const initial = firstName.slice(0, 1).toUpperCase();

  const onPress = () => {
    tapLight();
    router.push('/(tabs)/profile' as never);
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View
        style={[
          styles.wrap,
          {
            backgroundColor: t.isDark
              ? (t.colors as any).accentCognac
              : (t.colors as any).accentRose,
          },
        ]}
      >
        <Text
          style={{
            color: t.isDark ? (t.colors.textPrimary as string) : '#fff',
            fontFamily: t.isDark ? t.typography.numeralsMale : t.typography.numeralsFemale,
            fontSize: 14,
          }}
        >
          {initial || '·'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
