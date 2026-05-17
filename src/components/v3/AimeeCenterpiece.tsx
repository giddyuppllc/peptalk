/**
 * AimeeCenterpiece — home-only top-of-screen Aimee surface (§9.8).
 *
 * Large animated gradient orb (~120px), soft 4-5s pulse loop, a single
 * Aimee observation underneath, plus a row of 3-4 contextual chips.
 * Tap the orb or any chip → opens AimeeChatSheet with the intent
 * pre-loaded.
 *
 * Phase A: static placeholder observation ("Welcome — I'll start
 * learning soon.") + universal chips. Phase F1 wires the dynamic
 * observation engine (§9.8 Pro tier).
 */

import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import {
  useAimeeRouter,
  type AimeeIntent,
} from '../../hooks/useAimeeRouter';
import { Chip } from './ChipRow';

interface Props {
  /** Override the observation (Phase F1 will inject dynamic copy). */
  observation?: string;
  /** Override the chips. */
  chips?: { label: string; intent?: AimeeIntent; primary?: boolean }[];
}

const DEFAULT_CHIPS: NonNullable<Props['chips']> = [
  { label: 'Show my trend', intent: 'show_trend', primary: true },
  { label: 'Plan tomorrow', intent: 'plan_tomorrow' },
  { label: "What's new?", intent: 'whats_new' },
];

export function AimeeCenterpiece({
  observation = "Welcome — I'll start learning soon.",
  chips = DEFAULT_CHIPS,
}: Props) {
  const t = useV3Theme();
  const openAimee = useAimeeRouter();

  // Pulse animation
  const pulse = useSharedValue(1);
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      return;
    }
    const duration = t.isDark
      ? t.motion.orbPulseDurationMale
      : t.motion.orbPulseDurationFemale;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: duration / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: duration / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    // 2026-05-17 perf fix: cancel the infinite worklet on unmount so
    // the orb doesn't keep ticking after the user navigates away.
    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse, reduceMotion, t.isDark, t.motion.orbPulseDurationFemale, t.motion.orbPulseDurationMale]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const openSheet = (intent?: AimeeIntent) => {
    openAimee({
      intent: intent ?? 'open_chat',
      // Tapping the orb (no chip intent) sends the observation itself
      // as the prompt, so Aimee responds to *exactly* what the
      // centerpiece surfaced. Chips with an explicit intent get the
      // mapped prompt from useAimeeRouter.
      messageOverride: intent ? undefined : observation,
    });
  };

  const orbColors = (t.isDark
    ? [
        (t.colors as any).accentCognac,
        (t.colors as any).accentOxblood,
        (t.colors as any).accentOxbloodDeep,
      ]
    : [
        (t.colors as any).accentRose,
        (t.colors as any).accentLavender,
        (t.colors as any).accentMint,
      ]) as [string, string, ...string[]];

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => openSheet()}
        accessibilityRole="button"
        accessibilityLabel="Open Aimee chat"
      >
        <Animated.View style={[styles.orbWrap, orbStyle]}>
          <LinearGradient
            colors={orbColors}
            start={{ x: 0.3, y: 0.2 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.orb}
          />
          {/* Inner glow */}
          <View
            style={[
              styles.glow,
              {
                backgroundColor: t.isDark
                  ? 'rgba(201,136,90,0.18)'
                  : 'rgba(255,255,255,0.4)',
              },
            ]}
          />
        </Animated.View>
      </Pressable>

      <Text
        style={[
          styles.observation,
          {
            fontFamily: t.isDark
              ? t.typography.headlineMale
              : t.typography.headlineFemale,
            color: t.colors.textPrimary as string,
          },
        ]}
      >
        {observation}
      </Text>

      <View style={styles.chipRow}>
        {chips.map((c, i) => (
          <Chip
            key={i}
            label={c.label}
            primary={c.primary}
            onPress={() => openSheet(c.intent)}
          />
        ))}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  orbWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  glow: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    top: 20,
    left: 30,
    opacity: 0.5,
  },
  observation: {
    marginTop: 18,
    fontSize: 17,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  chipRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
});
