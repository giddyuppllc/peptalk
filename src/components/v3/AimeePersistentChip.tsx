/**
 * AimeePersistentChip — top of every detail screen (§9.9).
 *
 * Compact: 24px avatar + 1-line observation specific to the screen.
 * Tap → opens AimeeChatSheet.
 *
 * Auto-collapses to just the avatar after 8s of scroll (a future enhancement —
 * the chip in Phase A is statically-rendered; collapse animation lives in F1
 * once we have real scroll integration). For now, the prop `collapsed` can
 * be flipped manually.
 */

import React, { useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { tapMedium } from '../../utils/haptics';
import { AimeeChatSheet } from './AimeeChatSheet';

interface Props {
  /** 1-line observation specific to this screen. */
  observation: string;
  /** Intent pre-load for the chat sheet on tap. */
  intent?: string;
  /** Compact mode — just the avatar (used after 8s of scroll, Phase F1). */
  collapsed?: boolean;
}

export function AimeePersistentChip({ observation, intent, collapsed }: Props) {
  const t = useV3Theme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const onPress = () => {
    tapMedium();
    setSheetOpen(true);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Open Aimee chat"
      >
        <View
          style={[
            styles.chip,
            {
              backgroundColor: t.isDark
                ? 'rgba(255,255,255,0.05)'
                : 'rgba(255,255,255,0.6)',
              borderColor: t.isDark
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(42,26,79,0.08)',
              borderRadius: t.radius.pill,
            },
          ]}
        >
          <View
            style={[
              styles.avatar,
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
                fontFamily: t.isDark
                  ? t.typography.numeralsMale
                  : t.typography.numeralsFemale,
                fontSize: 11,
              }}
            >
              A
            </Text>
          </View>
          {!collapsed ? (
            <Text
              style={{
                flex: 1,
                fontFamily: t.typography.body,
                fontSize: 12,
                color: t.colors.textPrimary as string,
                lineHeight: 16,
              }}
              numberOfLines={2}
            >
              {observation}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <AimeeChatSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        intent={intent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
    borderWidth: 1,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
