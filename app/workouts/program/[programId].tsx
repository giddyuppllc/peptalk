/**
 * Program detail (dynamic route) — shows weekly breakdown and starts the program.
 *
 * Replaces the old query-param flavor at app/workouts/program.tsx. Routes are
 * now `/workouts/program/ll-body-recomp-1` style — that's what the train tab
 * and the dashboard's "Following a program?" row link to.
 *
 * Falls back to the same `programId` local search param if anyone navigates
 * here legacy-style, so the old paths from saved state / Aimee deep-links
 * don't break.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../../../src/components/GlassCard';
import { GradientButton } from '../../../src/components/GradientButton';
import { Colors, Spacing, FontSizes } from '../../../src/constants/theme';
import { getProgramById } from '../../../src/data/workoutPrograms';
import { getExerciseById } from '../../../src/data/exercises';
import { useWorkoutStore } from '../../../src/store/useWorkoutStore';
import type { WorkoutDay } from '../../../src/types/fitness';

// ---------------------------------------------------------------------------
// Day Preview
// ---------------------------------------------------------------------------

function DayPreview({ day }: { day: WorkoutDay }) {
  const exerciseNames = day.exercises.map((ex) => {
    const info = getExerciseById(ex.exerciseId);
    return info?.name ?? ex.exerciseId;
  });
  const totalSets = day.exercises.reduce((sum, e) => sum + e.reps.length, 0);

  return (
    <View style={styles.dayRow}>
      <View style={styles.dayBadge}>
        <Text style={styles.dayBadgeText}>
          D{day.code.split('/D')[1] ?? '?'}
        </Text>
      </View>
      <View style={styles.dayInfo}>
        <Text style={styles.dayTitle}>{day.name}</Text>
        <Text style={styles.dayExercises} numberOfLines={2}>
          {exerciseNames.join(' • ')}
        </Text>
        <Text style={styles.daySets}>
          {day.exercises.length} exercises · {totalSets} sets
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function ProgramDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ programId?: string }>();
  const programId = params.programId ?? '';
  const program = getProgramById(programId);
  const { activeProgram, startProgram } = useWorkoutStore();
  const isActive = activeProgram?.programId === programId;

  if (!program) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Program not found</Text>
          <GradientButton label="Go Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const handleStart = () => {
    startProgram(program.id);
    router.push(`/workouts/player-v2?programId=${program.id}` as never);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {program.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <LinearGradient
            colors={[Colors.raindropsDeep, Colors.raindropsDeep]}
            style={styles.heroIcon}
          >
            <Ionicons name="barbell-outline" size={36} color="#fff" />
          </LinearGradient>
          <Text style={styles.heroTitle}>{program.name}</Text>
          <Text style={styles.heroCreator}>by {program.createdBy}</Text>
          <View style={styles.heroMeta}>
            <View style={styles.heroPill}>
              <Ionicons name="calendar-outline" size={14} color={Colors.raindropsDeep} />
              <Text style={styles.heroPillText}>
                {program.durationWeeks} weeks
              </Text>
            </View>
            <View style={styles.heroPill}>
              <Ionicons name="fitness-outline" size={14} color={Colors.raindropsDeep} />
              <Text style={styles.heroPillText}>
                {program.weeks[0]?.days.length} days/wk
              </Text>
            </View>
            <View style={styles.heroPill}>
              <Ionicons name="trophy-outline" size={14} color={Colors.raindropsDeep} />
              <Text style={styles.heroPillText}>{program.difficulty}</Text>
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About this program</Text>
          <GlassCard>
            <Text style={styles.descText}>{program.description}</Text>
          </GlassCard>
        </View>

        {/* Week breakdown */}
        {program.weeks.map((week) => (
          <View key={week.weekNumber} style={styles.section}>
            <Text style={styles.sectionTitle}>Week {week.weekNumber}</Text>
            <GlassCard>
              {week.days.map((day, i) => (
                <View key={day.id}>
                  <DayPreview day={day} />
                  {i < week.days.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </GlassCard>
          </View>
        ))}

        {/* CTA */}
        <View style={styles.ctaSection}>
          {isActive ? (
            <GradientButton
              label="Continue Program"
              onPress={() =>
                router.push(`/workouts/player-v2?programId=${program.id}` as never)
              }
              colors={[Colors.raindropsDeep, Colors.raindropsDeep]}
            />
          ) : (
            <GradientButton
              label="Start Program"
              onPress={handleStart}
              colors={[Colors.raindropsDeep, Colors.raindropsDeep]}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    textAlign: 'center',
  },
  scroll: { paddingBottom: 40 },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.darkText,
    textAlign: 'center',
  },
  heroCreator: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginTop: 4,
  },
  heroMeta: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.md,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.glassBlue,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
  },
  heroPillText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },

  // Sections
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: Spacing.sm,
  },
  descText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 22,
  },

  // Day preview
  dayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
  },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.raindropsDeep,
  },
  dayInfo: { flex: 1 },
  dayTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  dayExercises: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  daySets: {
    fontSize: FontSizes.xs,
    color: Colors.raindropsDeep,
    marginTop: 4,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },

  // CTA
  ctaSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
});
