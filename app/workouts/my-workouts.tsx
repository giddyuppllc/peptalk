/**
 * My Workouts — list of user-generated workouts saved from the generator sheet.
 * Tap a card to expand the day-by-day breakdown of exercises.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing } from '../../src/constants/theme';
import { useWorkoutStore, type SavedGeneratedWorkout } from '../../src/store/useWorkoutStore';
import { GOAL_LABELS } from '../../src/services/workoutGenerator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Workout Card
// ---------------------------------------------------------------------------

function WorkoutCard({
  workout,
  expanded,
  onToggle,
  onDelete,
  onStartDay,
  highlighted,
}: {
  workout: SavedGeneratedWorkout;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onStartDay: (dayIndex: number) => void;
  highlighted?: boolean;
}) {
  const t = useTheme();
  const accent = useSectionAccent();
  const goalLabel = GOAL_LABELS[workout.goal]?.label ?? workout.goal;

  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: t.surface,
          borderColor: highlighted ? accent.deep : t.cardBorder,
          borderWidth: highlighted ? 2 : 1,
        },
      ]}
    >
      {/* Card header — tap to expand */}
      <TouchableOpacity
        style={s.cardHeader}
        onPress={onToggle}
        onLongPress={onDelete}
        activeOpacity={0.7}
        delayLongPress={400}
      >
        <View style={[s.cardIcon, { backgroundColor: `${accent.deep}18` }]}>
          <Ionicons name="barbell" size={20} color={accent.deep} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.cardTitle, { color: t.text }]} numberOfLines={1}>
            {workout.name}
          </Text>
          <View style={s.cardMetaRow}>
            <View style={[s.goalBadge, { backgroundColor: `${accent.deep}15` }]}>
              <Text style={[s.goalBadgeText, { color: accent.deep }]}>{goalLabel}</Text>
            </View>
            <Text style={[s.metaText, { color: t.textSecondary }]}>
              {workout.daysPerWeek}d/wk · {workout.level}
            </Text>
          </View>
          <Text style={[s.createdText, { color: t.textSecondary }]}>
            Created {formatRelative(workout.createdAt)}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={t.textSecondary}
        />
      </TouchableOpacity>

      {/* Expanded — day-by-day breakdown */}
      {expanded && (
        <View style={[s.daysWrap, { borderTopColor: t.cardBorder }]}>
          {workout.workout.days.map((day, dayIdx) => (
            <View key={`${day.name}-${dayIdx}`} style={s.dayBlock}>
              <View style={s.dayHeader}>
                <Text style={[s.dayLabel, { color: t.textSecondary }]}>
                  DAY {dayIdx + 1}
                </Text>
                <TouchableOpacity
                  style={[s.dayStartBtn, { backgroundColor: accent.deep }]}
                  onPress={() => onStartDay(dayIdx)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="play" size={12} color="#fff" />
                  <Text style={s.dayStartText}>Start</Text>
                </TouchableOpacity>
              </View>
              <View style={[s.exerciseList, { borderColor: t.cardBorder }]}>
                {day.exercises.length === 0 ? (
                  <Text style={[s.emptyExerciseText, { color: t.textSecondary }]}>
                    No exercises generated for this day
                  </Text>
                ) : (
                  day.exercises.map((ex, i) => (
                    <View
                      key={`${ex.exercise.id}-${i}`}
                      style={[
                        s.exerciseRow,
                        i < day.exercises.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: t.cardBorder,
                        },
                      ]}
                    >
                      <Text style={[s.exerciseName, { color: t.text }]} numberOfLines={1}>
                        {ex.exercise.name}
                      </Text>
                      <Text style={[s.exerciseReps, { color: t.textSecondary }]}>
                        {ex.reps}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function MyWorkoutsScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();

  const savedWorkouts = useWorkoutStore((st) => st.savedGeneratedWorkouts);
  const deleteGeneratedWorkout = useWorkoutStore((st) => st.deleteGeneratedWorkout);

  // Newly generated workout starts expanded automatically
  const [expandedId, setExpandedId] = useState<string | null>(highlight ?? null);

  const handleDelete = (workout: SavedGeneratedWorkout) => {
    Alert.alert(
      'Delete Workout',
      `Remove "${workout.name}" permanently?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteGeneratedWorkout(workout.id);
            if (expandedId === workout.id) setExpandedId(null);
          },
        },
      ],
    );
  };

  const handleStartDay = (workout: SavedGeneratedWorkout, dayIndex: number) => {
    router.push({
      pathname: '/workouts/generated-tracker' as any,
      params: { workoutId: workout.id, dayIndex: String(dayIndex) },
    });
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]}>My Workouts</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentContainerStyle={s.scroll}
      >
        {savedWorkouts.length === 0 ? (
          <View style={s.emptyState}>
            <View style={[s.emptyIconWrap, { backgroundColor: `${accent.deep}18` }]}>
              <Ionicons name="sparkles-outline" size={32} color={accent.deep} />
            </View>
            <Text style={[s.emptyTitle, { color: t.text }]}>No workouts yet</Text>
            <Text style={[s.emptyDesc, { color: t.textSecondary }]}>
              Generate your first custom workout from the workouts page. It'll be saved here and ready to run any time.
            </Text>
            <TouchableOpacity
              style={[s.emptyBtn, { backgroundColor: accent.deep }]}
              onPress={() => router.push('/(tabs)/workouts')}
              activeOpacity={0.85}
            >
              <Ionicons name="sparkles" size={16} color="#fff" />
              <Text style={s.emptyBtnText}>Generate a Workout</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[s.subhead, { color: t.textSecondary }]}>
              {savedWorkouts.length} saved workout{savedWorkouts.length !== 1 ? 's' : ''} · long-press to delete
            </Text>
            {savedWorkouts.map((workout) => (
              <WorkoutCard
                key={workout.id}
                workout={workout}
                expanded={expandedId === workout.id}
                highlighted={highlight === workout.id}
                onToggle={() => setExpandedId(expandedId === workout.id ? null : workout.id)}
                onDelete={() => handleDelete(workout)}
                onStartDay={(dayIndex) => handleStartDay(workout, dayIndex)}
              />
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.4,
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 8,
    paddingBottom: 40,
  },
  subhead: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    marginBottom: 14,
  },

  // Card
  card: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  goalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  goalBadgeText: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.3,
  },
  metaText: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
  },
  createdText: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 3,
  },

  // Days
  daysWrap: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  dayBlock: {
    marginTop: 12,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dayLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.6,
  },
  dayStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  dayStartText: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
  },
  exerciseList: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    gap: 12,
  },
  exerciseName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },
  exerciseReps: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
  },
  emptyExerciseText: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    paddingVertical: 12,
    paddingHorizontal: 12,
    textAlign: 'center',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 14,
  },
  emptyBtnText: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
  },
});
