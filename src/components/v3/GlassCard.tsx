/**
 * GlassCard — the universal card primitive (§3.4).
 *
 * BlurView material + accent-tinted background + theme-aware top
 * hairline. Female cards show an inset white highlight; male cards
 * show a cognac gradient hairline.
 *
 * Used everywhere a content card lives: home drill-ins, detail-screen
 * sections, modal contents, the calculator output cards, etc.
 */

import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useV3Theme } from '../../theme/V3ThemeProvider';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Override intensity (0-100). Default 22 — softer than RN's flat blur. */
  intensity?: number;
}

export function GlassCard({ children, style, intensity }: Props) {
  const t = useV3Theme();
  const radius = t.radius.card;

  return (
    <View style={[styles.wrap, { borderRadius: radius }, t.isDark ? t.shadows.cardDark : t.shadows.cardLight, style]}>
      <BlurView
        intensity={intensity ?? 22}
        tint={t.isDark ? 'dark' : 'light'}
        style={[styles.blur, { borderRadius: radius }]}
      />
      {/* Tinted fill on top of blur */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: t.colors.cardBg as string,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: t.colors.cardBorder as string,
          },
        ]}
      />
      {/* Top hairline — cognac gradient on male, white highlight on female */}
      {t.isDark ? (
        <LinearGradient
          colors={[
            (t.colors as any).cardTopHairlineStart,
            (t.colors as any).cardTopHairlineEnd,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.topHairline, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
        />
      ) : (
        <View
          style={[
            styles.topHairline,
            {
              backgroundColor: (t.colors as any).cardTopHighlight,
              borderTopLeftRadius: radius,
              borderTopRightRadius: radius,
            },
          ]}
        />
      )}
      <View style={[styles.inner, { padding: t.spacing.cardPadding }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  topHairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
  inner: {
    position: 'relative',
  },
});
