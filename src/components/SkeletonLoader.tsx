/**
 * Skeleton loading placeholder — shimmer effect for loading states.
 *
 * Use <Skeleton width={} height={} /> for individual elements.
 * Use <SkeletonCard /> for full card placeholders.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width,
  height,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: 'rgba(0,0,0,0.06)',
        },
        animStyle,
        style,
      ]}
    />
  );
}

/** Pre-built card skeleton with title + 3 lines */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Skeleton width={40} height={40} borderRadius={12} />
        <View style={styles.cardHeaderText}>
          <Skeleton width={120} height={14} />
          <Skeleton width={80} height={10} style={{ marginTop: 6 }} />
        </View>
      </View>
      <Skeleton width="100%" height={12} style={{ marginTop: 14 }} />
      <Skeleton width="85%" height={12} style={{ marginTop: 8 }} />
      <Skeleton width="60%" height={12} style={{ marginTop: 8 }} />
    </View>
  );
}

/** Pre-built list item skeleton */
export function SkeletonListItem() {
  return (
    <View style={styles.listItem}>
      <Skeleton width={36} height={36} borderRadius={10} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="40%" height={10} />
      </View>
    </View>
  );
}

/** Pre-built stats row skeleton */
export function SkeletonStats() {
  return (
    <View style={styles.statsRow}>
      <Skeleton width="30%" height={70} borderRadius={12} />
      <Skeleton width="30%" height={70} borderRadius={12} />
      <Skeleton width="30%" height={70} borderRadius={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
});

export default Skeleton;
