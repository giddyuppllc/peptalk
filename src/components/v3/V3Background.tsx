/**
 * V3Background — full-screen themed backdrop.
 *
 * Female: pastel gradient (lavender → mint) with 3 soft radial orbs
 * (rose top-left, blue top-right, mint bottom).
 *
 * Male: charcoal gradient (#1B1C1F → #131416) with cognac top-right
 * glow and oxblood bottom-left glow + subtle paneling stripes overlay.
 *
 * Stays absolutely positioned behind everything else on a screen. Drop
 * one at the root of any v3 screen and the rest of the UI sits on top.
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useV3Theme } from '../../theme/V3ThemeProvider';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export function V3Background() {
  const t = useV3Theme();

  if (t.isDark) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={[t.colors.bgBase1 as string, t.colors.bgBase2 as string]}
          style={StyleSheet.absoluteFill}
        />
        {/* Cognac top-right glow */}
        <View
          style={[
            styles.orb,
            {
              backgroundColor: (t.colors as any).bgGlowCognac,
              width: SCREEN_W * 1.1,
              height: SCREEN_W * 1.1,
              right: -SCREEN_W * 0.4,
              top: -SCREEN_W * 0.4,
            },
          ]}
        />
        {/* Oxblood bottom-left glow */}
        <View
          style={[
            styles.orb,
            {
              backgroundColor: (t.colors as any).bgGlowOxblood,
              width: SCREEN_W * 1.2,
              height: SCREEN_W * 1.2,
              left: -SCREEN_W * 0.5,
              bottom: -SCREEN_W * 0.5,
            },
          ]}
        />
      </View>
    );
  }

  // Female render — pastel gradient + 3 radial orbs.
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[t.colors.bgBase1 as string, t.colors.bgBase2 as string]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.orb,
          {
            backgroundColor: (t.colors as any).bgOrbRose,
            width: SCREEN_W * 0.9,
            height: SCREEN_W * 0.9,
            left: -SCREEN_W * 0.2,
            top: -SCREEN_W * 0.2,
          },
        ]}
      />
      <View
        style={[
          styles.orb,
          {
            backgroundColor: (t.colors as any).bgOrbBlue,
            width: SCREEN_W * 0.8,
            height: SCREEN_W * 0.8,
            right: -SCREEN_W * 0.2,
            top: SCREEN_H * 0.05,
          },
        ]}
      />
      <View
        style={[
          styles.orb,
          {
            backgroundColor: (t.colors as any).bgOrbMint,
            width: SCREEN_W * 1.0,
            height: SCREEN_W * 1.0,
            left: -SCREEN_W * 0.1,
            bottom: -SCREEN_W * 0.3,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    borderRadius: 9999,
  },
});
