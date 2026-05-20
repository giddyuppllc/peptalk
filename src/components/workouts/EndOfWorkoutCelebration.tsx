/**
 * EndOfWorkoutCelebration — Apple-Fitness-style summary screen.
 *
 * Shows volume totals, PRs detected for this session, and a weekly streak
 * dot row. Pure presentational — the parent computes everything and hands
 * it in. No store reads here so it's easy to dry-run in storybook.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { GradientButton } from '../GradientButton';
import { FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { notifySuccess } from '../../utils/haptics';

export interface PRRecord {
  exerciseName: string;
  previousLbs: number | null;
  newLbs: number;
}

interface DayBadge {
  /** Mon, Tue, ... */
  label: string;
  /** 'done' = ✓, 'today' = pulse, 'rest' = ●, empty undefined */
  state: 'done' | 'today' | 'planned' | 'rest';
}

interface EndOfWorkoutCelebrationProps {
  workoutName: string;
  totalSets: number;
  durationMinutes: number;
  estimatedCalories: number;
  prs: PRRecord[];
  /** 7-day week strip: Mon..Sun */
  week: DayBadge[];
  weekProgress: { done: number; target: number };
  accentColor: string;
  accentSoft: string;
  textColor: string;
  textMutedColor: string;
  surfaceColor: string;
  borderColor: string;
  bgColor: string;
  onDone: () => void;
}

export function EndOfWorkoutCelebration({
  workoutName,
  totalSets,
  durationMinutes,
  estimatedCalories,
  prs,
  week,
  weekProgress,
  accentColor,
  accentSoft,
  textColor,
  textMutedColor,
  surfaceColor,
  borderColor,
  bgColor,
  onDone,
}: EndOfWorkoutCelebrationProps) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 140 });
    opacity.value = withDelay(80, withSpring(1, { damping: 18 }));
    notifySuccess();
  }, [scale, opacity]);

  const trophyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bgColor }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero check medallion */}
        <Animated.View style={[styles.heroWrap, trophyStyle]}>
          <LinearGradient
            colors={[accentColor, accentSoft]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroMedallion}
          >
            <Ionicons name="checkmark" size={56} color="#fff" />
          </LinearGradient>
        </Animated.View>

        <Text
          style={[styles.heroTitle, { color: textColor }]}
          accessibilityRole="header"
        >
          Workout done
        </Text>
        <Text style={[styles.heroSub, { color: textMutedColor }]}>
          {workoutName}
        </Text>

        {/* Three big stats */}
        <View style={[styles.statRow, { backgroundColor: surfaceColor, borderColor }]}>
          <Stat label="sets" value={String(totalSets)} color={textColor} muted={textMutedColor} />
          <View style={[styles.divider, { backgroundColor: borderColor }]} />
          <Stat
            label="minutes"
            value={String(durationMinutes)}
            color={textColor}
            muted={textMutedColor}
          />
          <View style={[styles.divider, { backgroundColor: borderColor }]} />
          <Stat
            label="cal"
            value={`~${estimatedCalories}`}
            color={textColor}
            muted={textMutedColor}
          />
        </View>

        {/* PRs */}
        {prs.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: textMutedColor }]}>
              PRs today
            </Text>
            {prs.map((pr, i) => (
              <View
                key={`${pr.exerciseName}-${i}`}
                style={[
                  styles.prRow,
                  { backgroundColor: accentColor + '11', borderColor: accentColor + '33' },
                ]}
                accessibilityLabel={`New personal record on ${pr.exerciseName}: ${pr.previousLbs ?? 0} to ${pr.newLbs} pounds`}
              >
                <Text style={styles.trophyEmoji}>🎉</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.prTitle, { color: textColor }]}>
                    {pr.exerciseName}
                  </Text>
                  <Text style={[styles.prDelta, { color: accentColor }]}>
                    {pr.previousLbs != null ? `${pr.previousLbs} → ` : ''}
                    {pr.newLbs} lb
                    {pr.previousLbs != null
                      ? ` (+${(pr.newLbs - pr.previousLbs).toFixed(0)})`
                      : ' · first log'}
                  </Text>
                </View>
                <Ionicons name="trophy" size={20} color={accentColor} />
              </View>
            ))}
          </View>
        )}

        {/* Week strip */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: textMutedColor }]}>
            Your week
          </Text>
          <View style={[styles.weekRow, { backgroundColor: surfaceColor, borderColor }]}>
            {week.map((d, i) => (
              <View key={i} style={styles.dayCol} accessibilityLabel={`${d.label} ${d.state}`}>
                <Text style={[styles.dayLabel, { color: textMutedColor }]}>
                  {d.label}
                </Text>
                <View
                  style={[
                    styles.dayDot,
                    d.state === 'done' && { backgroundColor: accentColor, borderColor: accentColor },
                    d.state === 'today' && { borderColor: accentColor, borderWidth: 2 },
                    d.state === 'planned' && { borderColor: textMutedColor },
                    d.state === 'rest' && { backgroundColor: 'transparent', borderColor: 'transparent' },
                  ]}
                >
                  {d.state === 'done' && (
                    <Ionicons name="checkmark" size={11} color="#fff" />
                  )}
                  {d.state === 'today' && (
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: accentColor,
                      }}
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
          <Text style={[styles.weekFooter, { color: textMutedColor }]}>
            You're {weekProgress.done} of {weekProgress.target} days into the
            week
          </Text>
        </View>

        <View style={styles.cta}>
          <GradientButton
            label="Done"
            onPress={onDone}
            colors={[accentColor, accentColor]}
            accessibilityLabel="Finish and close"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color: string;
  muted: string;
}) {
  return (
    <View style={styles.statCol}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.lg,
  },
  heroWrap: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  heroMedallion: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroTitle: {
    fontSize: 32,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  heroSub: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-Medium',
    textAlign: 'center',
    marginTop: 4,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  statCol: { flex: 1, alignItems: 'center' },
  statValue: {
    fontSize: 24,
    fontFamily: 'DMSans-Bold',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'DMSans-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  divider: { width: 1, height: 32 },
  section: {
    marginTop: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSizes.xs,
    fontFamily: 'DMSans-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  trophyEmoji: { fontSize: 22 },
  prTitle: {
    fontSize: FontSizes.md,
    fontFamily: 'DMSans-Bold',
  },
  prDelta: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-SemiBold',
    marginTop: 2,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  dayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  dayLabel: {
    fontSize: 10,
    fontFamily: 'DMSans-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dayDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekFooter: {
    fontSize: FontSizes.xs,
    fontFamily: 'DMSans-Medium',
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  cta: {
    marginTop: Spacing.xl,
  },
});

export default EndOfWorkoutCelebration;
