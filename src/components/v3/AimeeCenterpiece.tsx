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
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
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
  // Sparkle twinkles — three offset opacity loops so they don't all
  // peak at once. The user's feedback: "add three AI stars on it and a
  // tap icon so people know" — make the orb visibly an AI affordance.
  const sparkle1 = useSharedValue(0.4);
  const sparkle2 = useSharedValue(0.4);
  const sparkle3 = useSharedValue(0.4);
  // Tap-hint ring: subtle expanding ripple every few seconds so the
  // user notices the orb is interactive.
  const tapHint = useSharedValue(0);
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      sparkle1.value = 1;
      sparkle2.value = 1;
      sparkle3.value = 1;
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
    const sparkleLoop = (sv: { value: number }, delay: number) => {
      sv.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) }),
            withTiming(0.4, { duration: 800, easing: Easing.in(Easing.quad) }),
          ),
          -1,
          false,
        ),
      );
    };
    sparkleLoop(sparkle1, 0);
    sparkleLoop(sparkle2, 600);
    sparkleLoop(sparkle3, 1200);
    tapHint.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: 2500 }),
      ),
      -1,
      false,
    );
    // 2026-05-17 perf fix: cancel the infinite worklet on unmount so
    // the orb doesn't keep ticking after the user navigates away.
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(sparkle1);
      cancelAnimation(sparkle2);
      cancelAnimation(sparkle3);
      cancelAnimation(tapHint);
    };
  }, [pulse, sparkle1, sparkle2, sparkle3, tapHint, reduceMotion, t.isDark, t.motion.orbPulseDurationFemale, t.motion.orbPulseDurationMale]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  const sparkle1Style = useAnimatedStyle(() => ({ opacity: sparkle1.value }));
  const sparkle2Style = useAnimatedStyle(() => ({ opacity: sparkle2.value }));
  const sparkle3Style = useAnimatedStyle(() => ({ opacity: sparkle3.value }));
  const tapHintStyle = useAnimatedStyle(() => ({
    opacity: 1 - tapHint.value,
    transform: [{ scale: 1 + tapHint.value * 0.3 }],
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

  const sparkleColor = t.isDark ? '#FFE3C0' : '#FFFFFF';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => openSheet()}
        accessibilityRole="button"
        accessibilityLabel="Tap to chat with Aimee, or long-press the mic to talk"
      >
        <View style={styles.orbWrap}>
          {/* Outer tap-hint ring — expanding pulse every ~4 s. */}
          <Animated.View
            style={[
              styles.tapRing,
              { borderColor: t.isDark ? '#C9885A' : '#E5928D' },
              tapHintStyle,
            ]}
          />
          <Animated.View style={[styles.orbInner, orbStyle]}>
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
            {/* Three AI sparkles positioned around the orb */}
            <Animated.View style={[styles.sparkleTopRight, sparkle1Style]}>
              <Ionicons name="sparkles" size={18} color={sparkleColor} />
            </Animated.View>
            <Animated.View style={[styles.sparkleTopLeft, sparkle2Style]}>
              <Ionicons name="sparkles" size={14} color={sparkleColor} />
            </Animated.View>
            <Animated.View style={[styles.sparkleBottom, sparkle3Style]}>
              <Ionicons name="sparkles" size={12} color={sparkleColor} />
            </Animated.View>
            {/* Tap-affordance icon at the bottom edge */}
            <View style={[styles.tapBadge, { backgroundColor: t.isDark ? '#1F1F1F' : '#FFFFFFEE' }]}>
              <Ionicons
                name="hand-left"
                size={12}
                color={t.isDark ? '#FFE3C0' : '#7A4B6B'}
              />
            </View>
          </Animated.View>
        </View>
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
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbInner: {
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
  tapRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
  },
  sparkleTopRight: {
    position: 'absolute',
    top: 4,
    right: 8,
  },
  sparkleTopLeft: {
    position: 'absolute',
    top: 18,
    left: 4,
  },
  sparkleBottom: {
    position: 'absolute',
    bottom: 18,
    right: 18,
  },
  tapBadge: {
    position: 'absolute',
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
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
