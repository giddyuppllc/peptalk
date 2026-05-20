/**
 * ProBadge — tier chip (PRO ★).
 *
 * Male: cognac gradient pill with star. Female: placeholder pastel pill.
 * Pulls Pro status from useSubscriptionStore.
 */

import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { useSubscriptionStore } from '../../store/useSubscriptionStore';

interface Props {
  /** Override visible Pro status (e.g. for previews). */
  forcePro?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ProBadge({ forcePro, style }: Props) {
  const t = useV3Theme();
  const tier = useSubscriptionStore((s) => s.tier);
  const isPro = forcePro ?? tier !== 'free';
  if (!isPro) return null;

  if (t.isDark) {
    return (
      <View style={[styles.wrap, style]}>
        <LinearGradient
          colors={[
            (t.colors as any).accentCognac,
            (t.colors as any).accentCognacDeep,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.pill, { borderRadius: t.radius.pill }]}
        >
          <Text
            style={{
              color: t.colors.textPrimary as string,
              fontFamily: t.typography.label,
              fontSize: 10,
              letterSpacing: 1.4,
            }}
          >
            PRO ★
          </Text>
        </LinearGradient>
      </View>
    );
  }

  // Female render — soft rose pill
  return (
    <View
      style={[
        styles.pillSimple,
        {
          backgroundColor: 'rgba(229,146,141,0.18)',
          borderRadius: t.radius.pill,
          borderWidth: 1,
          borderColor: 'rgba(229,146,141,0.4)',
        },
        style,
      ]}
    >
      <Text
        style={{
          color: (t.colors as any).accentRose,
          fontFamily: t.typography.label,
          fontSize: 10,
          letterSpacing: 1.4,
        }}
      >
        PRO ★
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillSimple: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
