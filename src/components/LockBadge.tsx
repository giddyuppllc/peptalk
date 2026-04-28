/**
 * LockBadge — small lock pill to mark a feature as locked for free-tier users.
 *
 * Usage:
 *   <LockBadge tier="pro" />                       // inline pill
 *   <LockBadge tier="plus" position="top-right" /> // absolute overlay
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type LockTier = 'plus' | 'pro';
type LockSize = 'sm' | 'md' | 'lg';
type LockPosition = 'inline' | 'top-right' | 'top-left';

interface LockBadgeProps {
  tier: LockTier;
  size?: LockSize;
  position?: LockPosition;
}

const TIER_COLORS: Record<LockTier, readonly [string, string]> = {
  plus: ['#E89672', '#F5DAD6'] as const,
  pro: ['#7FB3D8', '#3E7CB1'] as const,
};

const TIER_LABEL: Record<LockTier, string> = {
  plus: 'PLUS',
  pro: 'PRO',
};

const SIZE_STYLES: Record<LockSize, { h: number; px: number; fontSize: number; iconSize: number; gap: number }> = {
  sm: { h: 18, px: 6, fontSize: 9, iconSize: 10, gap: 3 },
  md: { h: 22, px: 8, fontSize: 10, iconSize: 11, gap: 4 },
  lg: { h: 28, px: 10, fontSize: 11, iconSize: 13, gap: 5 },
};

export function LockBadge({ tier, size = 'md', position = 'inline' }: LockBadgeProps) {
  const sizeStyle = SIZE_STYLES[size];
  const colors = TIER_COLORS[tier];

  const positionStyle =
    position === 'top-right'
      ? { position: 'absolute' as const, top: 8, right: 8, zIndex: 10 }
      : position === 'top-left'
        ? { position: 'absolute' as const, top: 8, left: 8, zIndex: 10 }
        : {};

  return (
    <View style={positionStyle}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.badge,
          {
            height: sizeStyle.h,
            paddingHorizontal: sizeStyle.px,
            gap: sizeStyle.gap,
          },
        ]}
      >
        <Ionicons name="lock-closed" size={sizeStyle.iconSize} color="#fff" />
        <Text
          style={[
            styles.label,
            {
              fontSize: sizeStyle.fontSize,
            },
          ]}
        >
          {TIER_LABEL[tier]}
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.8,
  },
});

export default LockBadge;
