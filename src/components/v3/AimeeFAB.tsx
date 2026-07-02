/**
 * AimeeFAB — bottom-right floating action button on every v3 screen.
 *
 * Female: rose→lavender gradient with a serif "A".
 * Male: oxblood→cognac gradient with a serif "A" in bone.
 *
 * Tap         → routes to /(tabs)/peptalk with an optional intent
 *               pre-loader. The chat surface auto-sends on arrival.
 * Long-press  → starts voice recording. Release to send the transcript
 *               to Aimee chat (handled via useAimeeVoice).
 *
 * The shared useChatStore makes the thread continue seamlessly across
 * every screen (§9.10).
 */

import React from 'react';
import { Pressable, View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { useAimeeRouter, type AimeeIntent } from '../../hooks/useAimeeRouter';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useAimeeVoice } from '../../hooks/useAimeeVoice';
import { AimeeSparkIcon } from '../AimeeSparkIcon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  /** Optional intent that pre-loads the chat on tap. */
  intent?: AimeeIntent;
  style?: StyleProp<ViewStyle>;
}

export function AimeeFAB({ intent = 'open_chat', style }: Props) {
  const t = useV3Theme();
  const insets = useSafeAreaInsets();
  const openAimee = useAimeeRouter();
  const { status, start, stop } = useAimeeVoice();
  const scale = useSharedValue(1);
  const pulse = useSharedValue(1);
  const reduceMotion = useReduceMotion();

  const isRecording = status === 'recording';
  const isBusy = status === 'uploading' || status === 'transcribing';

  // Soft breathing animation only while the user is actively holding —
  // gives clear visual feedback that the mic is hot.
  React.useEffect(() => {
    if (isRecording && !reduceMotion) {
      pulse.value = withRepeat(
        withTiming(1.15, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
    // 2026-05-17 perf fix: cancel the looping worklet on unmount.
    // Without this, a navigation away mid-recording leaves the
    // shared-value ticking until the component is GC'd, which is
    // never if the FAB is mounted on Home + chat.
    return () => {
      cancelAnimation(pulse);
    };
  }, [isRecording, pulse, reduceMotion]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulse.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        if (isRecording || isBusy) return;
        openAimee(intent);
      }}
      onLongPress={() => {
        // 350 ms LongPress threshold → unmistakably intentional. We
        // hand off to useAimeeVoice; the user keeps their finger down
        // until release (handled by onPressOut below).
        start();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.92, t.motion.cardPress);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, t.motion.cardPress);
        if (isRecording) stop();
      }}
      delayLongPress={350}
      style={[
        styles.wrap,
        // Wave 76.49: lift the FAB above whatever the OS reserves at the
        // bottom — iPhone home indicator (~34) or Android 3-button nav
        // (~48). Without this the gradient circle was half-covered by
        // the Galaxy/Pixel nav pill on testers' phones.
        { bottom: Math.max(insets.bottom, 12) + 18 },
        aStyle,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        isRecording ? 'Release to send to Aimee' : 'Open Aimee chat. Long-press to talk.'
      }
      accessibilityState={{ busy: isBusy }}
    >
      <LinearGradient
        colors={
          isRecording
            ? ['#FF4D6D', '#C9305A']
            : [
                (t.colors as any).fabGradientStart,
                (t.colors as any).fabGradientEnd,
              ]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, t.shadows.fab]}
      >
        {isRecording ? (
          <Ionicons name="mic" size={24} color="#fff" />
        ) : isBusy ? (
          <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
        ) : (
          // Health-AI spark — replaced the serif "A" / DNA branding, which
          // testers read as anatomical. A sparkle reads unambiguously as
          // "AI assistant".
          <AimeeSparkIcon size={26} color={t.isDark ? (t.colors.textPrimary as string) : '#fff'} />
        )}
      </LinearGradient>
      {!isRecording && !isBusy ? (
        <View
          style={[
            styles.micPip,
            { borderColor: t.colors.bgBase1 as string },
          ]}
        >
          <Ionicons name="mic" size={10} color="#fff" />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 18,
    // bottom is overridden in the component via safe-area insets.
    zIndex: 50,
  },
  gradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micPip: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1F1F1F',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
