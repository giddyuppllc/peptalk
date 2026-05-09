/**
 * LiveEventBanner — pulsing red-dot "LIVE" banner that surfaces on
 * home + the community feed when an admin is hosting an active event.
 *
 * Tier-gated visibility: hidden for users below the event's required_tier
 * (defaults to plus). Free users won't see the banner at all rather
 * than seeing a paywalled tease — keeps the feature feeling exclusive.
 *
 * Tap → /community/live/[eventId] (the live chat screen).
 */

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLiveEventStore } from '../store/useLiveEventStore';
import { useTier } from '../hooks/useFeatureGate';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes, BorderRadius } from '../constants/theme';

export function LiveEventBanner() {
  const router = useRouter();
  const t = useTheme();
  const tier = useTier();
  const active = useLiveEventStore((s) => s.active);
  const hydrate = useLiveEventStore((s) => s.hydrateActive);

  // Quietly poll on mount to discover an existing live event. Realtime
  // covers transitions while the user is in the app; this catches the
  // initial cold-start state.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Pulse animation for the LIVE dot.
  const pulse = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  if (!active) return null;

  // Tier gate: 'free' event = visible to all; 'plus' = plus + pro;
  // 'pro' = pro only.
  const allowed = (() => {
    if (active.requiredTier === 'free') return true;
    if (active.requiredTier === 'plus') return tier === 'plus' || tier === 'pro';
    return tier === 'pro';
  })();
  if (!allowed) return null;

  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => router.push(`/community/live/${active.id}` as any)}
      style={styles.wrapper}
      accessibilityRole="button"
      accessibilityLabel={`Join live event: ${active.title}`}
    >
      <LinearGradient
        colors={['#3E7CB1', '#7FB3C2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.livePill}>
          <Animated.View style={[styles.liveDot, { opacity: dotOpacity }]} />
          <Text style={styles.liveLabel}>LIVE</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {active.title}
          </Text>
          <Text style={styles.host} numberOfLines={1} ellipsizeMode="tail">
            {active.hostName ? `Hosted by ${active.hostName}` : 'Tap to join the chat'}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.85)" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#3E7CB1',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#ef4444',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    color: '#fff',
    fontSize: FontSizes.sm,
    fontWeight: '800',
  },
  host: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 2,
  },
});

export default LiveEventBanner;
