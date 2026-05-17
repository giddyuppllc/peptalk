/**
 * V3DetailShell — common chrome for v3 detail screens.
 *
 * Drops a V3Background, greeting (screen-header variant), the
 * AimeePersistentChip, a back arrow, and an avatar shortcut. Children
 * render the screen-specific content.
 */

import React from 'react';
import { View, Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { V3Background } from './V3Background';
import { Greeting } from './Greeting';
import { AimeePersistentChip } from './AimeePersistentChip';
import { AimeeFAB } from './AimeeFAB';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { tapLight } from '../../utils/haptics';

interface Props {
  /** Screen title shown in the greeting slot. */
  title: string;
  /** 1-line observation surfaced in the persistent Aimee chip. */
  observation: string;
  /** Intent the chat sheet pre-loads when the user taps Aimee. */
  intent?: string;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

export function V3DetailShell({
  title,
  observation,
  intent,
  children,
  contentStyle,
}: Props) {
  const t = useV3Theme();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <V3Background />
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => {
            tapLight();
            router.back();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={t.colors.textPrimary as string}
          />
        </Pressable>
        <Greeting variant="screen-header" subline={title} />
      </View>
      <AimeePersistentChip observation={observation} intent={intent} />
      <View style={[styles.body, contentStyle]}>{children}</View>
      <AimeeFAB />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 0,
    paddingTop: 60,
    gap: 4,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
});
