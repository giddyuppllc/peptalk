/**
 * Celebration modal — shows when user earns a badge or levels up.
 *
 * Full-screen overlay with confetti, badge display, and XP animation.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Confetti } from './Confetti';
import { AnimatedPress } from './AnimatedPress';
import { notifySuccess } from '../utils/haptics';
import { Colors, FontSizes } from '../constants/theme';
import { BADGES, useAchievementStore } from '../store/useAchievementStore';

export function CelebrationModal() {
  const { pendingCelebrations, dismissCelebration, getLevel } =
    useAchievementStore();

  const badgeId = pendingCelebrations[0] ?? null;
  const badge = badgeId ? BADGES.find((b) => b.id === badgeId) : null;
  const level = getLevel();

  const badgeScale = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const xpScale = useSharedValue(0);

  useEffect(() => {
    if (badge) {
      notifySuccess();
      badgeScale.value = withSpring(1, { damping: 8, stiffness: 100 });
      textOpacity.value = withDelay(400, withTiming(1, { duration: 500 }));
      xpScale.value = withDelay(
        800,
        withSequence(
          withSpring(1.2, { damping: 8 }),
          withSpring(1, { damping: 12 }),
        ),
      );
    } else {
      badgeScale.value = 0;
      textOpacity.value = 0;
      xpScale.value = 0;
    }
  }, [badge, badgeScale, textOpacity, xpScale]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  const xpStyle = useAnimatedStyle(() => ({
    transform: [{ scale: xpScale.value }],
  }));

  if (!badge) return null;

  return (
    <Modal visible transparent animationType="fade">
      {/* 2026-05-17 a11y: trap VoiceOver focus inside the modal */}
      <View style={styles.overlay} accessibilityViewIsModal={true}>
        <Confetti
          visible
          onComplete={() => {
            /* confetti auto-clears */
          }}
        />

        <View style={styles.content}>
          {/* Badge icon */}
          <Animated.View style={[styles.badgeContainer, badgeStyle]}>
            <LinearGradient
              colors={[Colors.pepTeal, Colors.pepBlue]}
              style={styles.badgeCircle}
            >
              <Ionicons
                name={badge.icon as any}
                size={48}
                color="#fff"
              />
            </LinearGradient>
          </Animated.View>

          {/* Text */}
          <Animated.View style={[styles.textContainer, textStyle]}>
            <Text style={styles.achievedLabel}>Achievement Unlocked!</Text>
            <Text style={styles.badgeName}>{badge.name}</Text>
            <Text style={styles.badgeDesc}>{badge.description}</Text>
          </Animated.View>

          {/* XP reward */}
          <Animated.View style={[styles.xpContainer, xpStyle]}>
            <Text style={styles.xpAmount}>+{badge.xpReward} XP</Text>
            <Text style={styles.levelText}>
              Level {level.level} · {level.title}
            </Text>
          </Animated.View>

          {/* Dismiss */}
          <AnimatedPress
            onPress={() => dismissCelebration(badge.id)}
            style={styles.dismissBtn}
          >
            <LinearGradient
              colors={[Colors.pepBlue, Colors.pepTeal]}
              style={styles.dismissGradient}
            >
              <Text style={styles.dismissText}>Awesome!</Text>
            </LinearGradient>
          </AnimatedPress>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  badgeContainer: {
    marginBottom: 24,
  },
  badgeCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  achievedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.pepTeal,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  badgeName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2D2D2D',
    marginBottom: 8,
  },
  badgeDesc: {
    fontSize: FontSizes.md,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  xpContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  xpAmount: {
    fontSize: 36,
    fontWeight: '900',
    color: Colors.pepTeal,
  },
  levelText: {
    fontSize: FontSizes.sm,
    color: '#6b7280',
    marginTop: 4,
  },
  dismissBtn: {
    width: '100%',
  },
  dismissGradient: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  dismissText: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: '#fff',
  },
});

export default CelebrationModal;
