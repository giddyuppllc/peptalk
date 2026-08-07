/**
 * GlassButton + DrillCard — pressable variants of GlassCard.
 *
 * GlassButton: anywhere a card-styled tap target is wanted (chips,
 * action tiles). Spring-scales to 0.97 on press, light haptic tick.
 *
 * DrillCard: the home-screen drill-in landing card. Same press
 * mechanic, plus accepts a `label` (uppercase) and inline `preview`
 * (any ReactNode — the per-vertical data widget renders here).
 */

import React from 'react';
import { Pressable, Text, View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { GlassCard } from './GlassCard';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { tapLight } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface GlassButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function GlassButton({ onPress, children, style, accessibilityLabel }: GlassButtonProps) {
  const t = useV3Theme();
  const scale = useSharedValue(1);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97, t.motion.cardPress);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, t.motion.cardPress);
      }}
      style={[aStyle, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <GlassCard>{children}</GlassCard>
    </AnimatedPressable>
  );
}

interface DrillCardProps {
  label: string;
  /**
   * What you get when you tap — e.g. "Macros & meals" under "Nutrition".
   * The label alone names a topic but not a destination, so the cards read as
   * read-only summaries; this plus the chevron says "there is a screen here".
   */
  hint?: string;
  preview: React.ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  /**
   * Overrides the spoken destination cue. Defaults to `hint`, which is the
   * right answer almost everywhere — pass this only when the visual hint reads
   * badly aloud.
   */
  accessibilityHint?: string;
}

export function DrillCard({
  label,
  hint,
  preview,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: DrillCardProps) {
  const t = useV3Theme();
  const scale = useSharedValue(1);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97, t.motion.cardPress);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, t.motion.cardPress);
      }}
      style={[aStyle, styles.wrap]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      // Pressable is accessible by default, so setting accessibilityLabel
      // collapses the card into a single node and the child Text — including
      // the visual `hint` that says where the card goes — is never announced.
      // A screen-reader user heard "Weekly Tracker" and no indication it was a
      // destination. Speaking the hint restores the cue the chevron gives
      // sighted users.
      accessibilityHint={accessibilityHint ?? hint}
    >
      <GlassCard>
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.label,
                fontSize: 10,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
              }}
            >
              {label}
            </Text>
            {hint ? (
              <Text
                style={{
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                  fontSize: 12,
                  opacity: 0.75,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {hint}
              </Text>
            ) : null}
          </View>
          {/* Chevron: the affordance. Without it these read as static summary
              tiles rather than doors to a screen. */}
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{
              color: t.colors.textSecondary as string,
              fontSize: 18,
              opacity: 0.45,
              marginLeft: 8,
            }}
          >
            {'›'}
          </Text>
        </View>
        <View style={{ marginTop: t.spacing.sm }}>{preview}</View>
      </GlassCard>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headText: {
    flex: 1,
    minWidth: 0,
  },
});
