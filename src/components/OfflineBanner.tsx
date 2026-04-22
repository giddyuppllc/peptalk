/**
 * Tiny persistent banner that appears across the top of the app when the
 * device loses connectivity. Rendered at the root layout so every screen
 * sees it without wiring up individually.
 *
 * Deliberately minimal:
 *   - 1 line tall
 *   - Brief, non-alarming copy ("You're offline — changes will sync when you reconnect")
 *   - Fades in/out with a small transition
 *   - No dismiss button; it hides itself when connection returns
 *
 * Recovery happens automatically via `subscribeToReconnect` in the root
 * layout — this component is just the visual indicator.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsOnline } from '../hooks/useNetworkStatus';

function OfflineBannerImpl() {
  const isOnline = useIsOnline();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: isOnline ? 0 : 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: isOnline ? -16 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOnline, opacity, translateY]);

  // Always render so the animation can play out on reconnect; pointerEvents
  // none so it never swallows touches.
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { opacity, transform: [{ translateY }] }]}
    >
      <SafeAreaView edges={['top']}>
        <Animated.View style={styles.banner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#92400E" />
          <Text style={styles.text} numberOfLines={1}>
            You're offline — changes will sync when you reconnect
          </Text>
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10_000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.95)',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#78350F',
    flexShrink: 1,
  },
});

export const OfflineBanner = React.memo(OfflineBannerImpl);
