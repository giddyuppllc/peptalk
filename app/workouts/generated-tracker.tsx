/**
 * Generated Workout Tracker — live tracking page for a single day of a saved generated workout.
 * Loads a SavedGeneratedWorkout from the store and lets the user log reps/weight/RPE per set.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { PaywallGate } from '../../src/hooks/useFeatureGate';
import { Spacing } from '../../src/constants/theme';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import {
  parseRepString,
  GOAL_LABELS,
  getRecommendedRpe,
  rpeLabel,
} from '../../src/services/workoutGenerator';
import type { WorkoutLogSet } from '../../src/types/fitness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetState {
  reps: string;
  weight: string;
  rpe: number | null;
  completed: boolean;
}

interface ExerciseState {
  exerciseId: string;
  exerciseName: string;
  targetReps: string[];
  isTimeBased: boolean;
  restLabel: string | null;
  restSeconds: number | null;
  setType: string;
  recommendedRpe: number;
  /** Progressive-overload reference: top set from the most recent prior session. */
  lastSummary: string | null;
  sets: SetState[];
}

/** Parse "30 seconds" / "1 minute" / "90 sec" / "2 min" into total seconds */
function parseRestToSeconds(rest?: string): number | null {
  if (!rest) return null;
  const match = rest.toLowerCase().match(/(\d+)\s*(second|sec|s|minute|min|m)/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  if (unit.startsWith('m')) return num * 60;
  return num;
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function GeneratedTrackerScreenWrapper() {
  return (
    <PaywallGate feature="generated_workout_tracker">
      <GeneratedTrackerScreen />
    </PaywallGate>
  );
}

function GeneratedTrackerScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();
  const params = useLocalSearchParams<{ workoutId?: string; dayIndex?: string }>();
  const workoutId = params.workoutId ?? '';
  const dayIndex = parseInt(params.dayIndex ?? '0', 10);

  const getGeneratedWorkoutById = useWorkoutStore((st) => st.getGeneratedWorkoutById);
  const logs = useWorkoutStore((st) => st.logs);
  const beginWorkout = useWorkoutStore((st) => st.beginWorkout);
  const logSet = useWorkoutStore((st) => st.logSet);
  const finishWorkout = useWorkoutStore((st) => st.finishWorkout);
  const cancelWorkout = useWorkoutStore((st) => st.cancelWorkout);

  const saved = getGeneratedWorkoutById(workoutId);
  const day = saved?.workout.days[dayIndex] ?? null;

  // Build initial exercise state from the day's exercises
  const initialExercises = useMemo<ExerciseState[]>(() => {
    if (!day || !saved) return [];
    return day.exercises.map((ex) => {
      const targets = parseRepString(ex.reps);
      const restSecs = parseRestToSeconds(ex.rest);
      const recRpe = getRecommendedRpe(saved.goal, ex.exercise.priority);

      // Progressive overload: find the most recent prior log that contains this
      // exercise, take its heaviest working set as a "last time" reference, and
      // prefill the weight input so the user starts from where they left off.
      // logs are stored newest-first (finishWorkout prepends).
      let lastWeight = '';
      let lastSummary: string | null = null;
      for (const log of logs) {
        const exSets = log.sets.filter((sx) => sx.exerciseId === ex.exercise.id);
        if (exSets.length === 0) continue;
        const top = exSets.reduce((a, b) =>
          (b.weightLbs ?? 0) > (a.weightLbs ?? 0) ? b : a,
        );
        if (top.weightLbs != null && top.weightLbs > 0) {
          lastWeight = String(top.weightLbs);
          lastSummary = `Last time: ${top.weightLbs} lb × ${top.reps} reps`;
        } else {
          lastSummary = `Last time: ${top.reps} reps`;
        }
        break;
      }

      return {
        exerciseId: ex.exercise.id,
        exerciseName: ex.exercise.name,
        targetReps: targets,
        isTimeBased: ex.exercise.isTimeBased,
        restLabel: ex.rest ?? null,
        restSeconds: restSecs,
        setType: ex.setType ?? 'normal',
        recommendedRpe: recRpe,
        lastSummary,
        sets: targets.map(() => ({ reps: '', weight: lastWeight, rpe: null, completed: false })),
      };
    });
  }, [day, saved, logs]);

  const [exercises, setExercises] = useState<ExerciseState[]>(initialExercises);
  const [started, setStarted] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Rest timer — auto-starts when a set is marked complete
  const [restRemaining, setRestRemaining] = useState<number>(0);
  const [restTotal, setRestTotal] = useState<number>(0);
  const [restLabel, setRestLabel] = useState<string>('');

  // Re-sync if user navigates between days (params change)
  React.useEffect(() => {
    setExercises(initialExercises);
    setStarted(false);
    setStartTime(null);
    setElapsedSeconds(0);
  }, [initialExercises]);

  // Live timer — ticks every second while the workout is running
  React.useEffect(() => {
    if (!started || startTime === null) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [started, startTime]);

  // Format elapsed time as MM:SS or HH:MM:SS for long sessions
  const formatElapsed = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const sec = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
    return `${pad(m)}:${pad(sec)}`;
  };

  const updateSet = useCallback(
    (exIdx: number, setIdx: number, patch: Partial<SetState>) => {
      setExercises((prev) => {
        const next = [...prev];
        const exCopy = { ...next[exIdx] };
        const setsCopy = [...exCopy.sets];
        const wasCompleted = setsCopy[setIdx].completed;
        setsCopy[setIdx] = { ...setsCopy[setIdx], ...patch };
        exCopy.sets = setsCopy;
        next[exIdx] = exCopy;

        // If the user just marked this set complete, fire the rest timer
        if (patch.completed === true && !wasCompleted && exCopy.restSeconds) {
          setRestRemaining(exCopy.restSeconds);
          setRestTotal(exCopy.restSeconds);
          setRestLabel(exCopy.restLabel ?? `${exCopy.restSeconds}s`);
        }

        return next;
      });
    },
    [],
  );

  // Rest countdown — ticks every second
  React.useEffect(() => {
    if (restRemaining <= 0) return;
    const interval = setInterval(() => {
      setRestRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [restRemaining]);

  const skipRest = () => {
    setRestRemaining(0);
    setRestTotal(0);
  };

  const addRestTime = (seconds: number) => {
    setRestRemaining((prev) => prev + seconds);
    setRestTotal((prev) => prev + seconds);
  };

  const handleStart = () => {
    beginWorkout(undefined, undefined, day?.name);
    setStartTime(Date.now());
    setElapsedSeconds(0);
    setStarted(true);
  };

  const totalSets = useMemo(() => exercises.reduce((sum, e) => sum + e.sets.length, 0), [exercises]);
  const completedSets = useMemo(
    () => exercises.reduce((sum, e) => sum + e.sets.filter((s) => s.completed).length, 0),
    [exercises],
  );
  const progressPercent = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  const handleFinish = () => {
    if (completedSets === 0) {
      Alert.alert('Nothing logged', 'Mark at least one set complete before finishing.');
      return;
    }
    Alert.alert(
      'Finish Workout',
      `${completedSets} of ${totalSets} sets · ${formatElapsed(elapsedSeconds)} elapsed\n\nSave and finish?`,
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'Finish',
          onPress: () => {
            // Push every completed set into the store
            exercises.forEach((ex) => {
              ex.sets.forEach((set, i) => {
                if (!set.completed) return;
                const logEntry: WorkoutLogSet = {
                  exerciseId: ex.exerciseId,
                  setNumber: i + 1,
                  reps: parseInt(set.reps, 10) || 0,
                  weightLbs: set.weight ? parseFloat(set.weight) : undefined,
                  rpe: set.rpe ?? undefined,
                  completed: true,
                };
                logSet(logEntry);
              });
            });
            finishWorkout(undefined, undefined, undefined, saved?.name);
            router.replace('/(tabs)/workouts');
          },
        },
      ],
    );
  };

  const handleCancel = () => {
    Alert.alert(
      'Discard Workout?',
      'Your logged sets will be lost.',
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            cancelWorkout();
            router.back();
          },
        },
      ],
    );
  };

  // ── Guard: missing workout / day ──
  if (!saved || !day) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: t.text }]}>Tracker</Text>
          <View style={s.iconBtn} />
        </View>
        <View style={s.errorState}>
          <Ionicons name="alert-circle-outline" size={40} color={t.textSecondary} />
          <Text style={[s.errorTitle, { color: t.text }]}>Workout not found</Text>
          <Text style={[s.errorDesc, { color: t.textSecondary }]}>
            This workout may have been deleted. Go back and pick another.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={started ? handleCancel : () => router.back()} style={s.iconBtn}>
            <Ionicons name={started ? 'close' : 'chevron-back'} size={24} color={t.text} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={[s.headerTitle, { color: t.text }]} numberOfLines={1}>
              Day {dayIndex + 1}
            </Text>
            <Text style={[s.headerSub, { color: t.textSecondary }]} numberOfLines={1}>
              {saved.name}
            </Text>
          </View>
          <View style={s.iconBtn} />
        </View>

        {/* Progress + Timer */}
        {started && (
          <View style={[s.progressWrap, { backgroundColor: t.surface }]}>
            <View style={s.progressTopRow}>
              <View style={s.timerWrap}>
                <Ionicons name="time-outline" size={14} color={accent.deep} />
                <Text style={[s.timerText, { color: t.text }]}>
                  {formatElapsed(elapsedSeconds)}
                </Text>
              </View>
              <Text style={[s.progressText, { color: t.textSecondary }]}>
                {completedSets} / {totalSets} sets · {progressPercent}%
              </Text>
            </View>
            <View style={[s.progressTrack, { backgroundColor: `${accent.deep}20` }]}>
              <View
                style={[
                  s.progressFill,
                  { backgroundColor: accent.deep, width: `${progressPercent}%` },
                ]}
              />
            </View>
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Pre-start summary */}
          {!started && (
            <View style={[s.summaryCard, { backgroundColor: t.surface, borderColor: `${accent.deep}30` }]}>
              <View style={[s.summaryIcon, { backgroundColor: `${accent.deep}18` }]}>
                <Ionicons name="barbell" size={24} color={accent.deep} />
              </View>
              <Text style={[s.summaryTitle, { color: t.text }]}>Ready to begin?</Text>
              <Text style={[s.summarySub, { color: t.textSecondary }]}>
                {exercises.length} exercise{exercises.length !== 1 ? 's' : ''} · {totalSets} sets total
              </Text>
              <Text style={[s.summaryGoal, { color: accent.deep }]}>
                {GOAL_LABELS[saved.goal]?.label ?? saved.goal} · {saved.level}
              </Text>
              <TouchableOpacity
                style={[s.startBtn, { backgroundColor: accent.deep }]}
                onPress={handleStart}
                activeOpacity={0.85}
              >
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={s.startBtnText}>Start Workout</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Exercise cards */}
          {exercises.map((ex, exIdx) => (
            <View
              key={`${ex.exerciseId}-${exIdx}`}
              style={[s.exerciseCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
            >
              <View style={s.exerciseHeader}>
                <Text style={[s.exerciseNumber, { color: accent.deep }]}>
                  {String(exIdx + 1).padStart(2, '0')}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.exerciseName, { color: t.text }]} numberOfLines={2}>
                    {ex.exerciseName}
                  </Text>
                  <View style={s.exerciseMetaRow}>
                    <View style={[s.exerciseMetaChip, { backgroundColor: `${t.accent}20` }]}>
                      <Ionicons name="flame" size={10} color={t.accent} />
                      <Text style={[s.exerciseMetaText, { color: t.accent }]}>
                        RPE {ex.recommendedRpe} · {rpeLabel(ex.recommendedRpe)}
                      </Text>
                    </View>
                    {ex.restLabel && (
                      <View style={[s.exerciseMetaChip, { backgroundColor: `${accent.deep}15` }]}>
                        <Ionicons name="hourglass-outline" size={10} color={accent.deep} />
                        <Text style={[s.exerciseMetaText, { color: accent.deep }]}>
                          Rest {ex.restLabel}
                        </Text>
                      </View>
                    )}
                    {ex.setType !== 'normal' && (
                      <View style={[s.exerciseMetaChip, { backgroundColor: `${t.secondary}15` }]}>
                        <Text style={[s.exerciseMetaText, { color: t.secondary }]}>
                          {ex.setType.replace(/_/g, ' ')}
                        </Text>
                      </View>
                    )}
                  </View>
                  {ex.lastSummary && (
                    <View style={s.lastTimeRow}>
                      <Ionicons name="trending-up" size={11} color={accent.deep} />
                      <Text style={[s.lastTimeText, { color: t.textSecondary }]} numberOfLines={1}>
                        {ex.lastSummary}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Column headers */}
              <View style={s.colHeaderRow}>
                <Text style={[s.colHeader, s.colSet, { color: t.textSecondary }]}>SET</Text>
                <Text style={[s.colHeader, s.colTarget, { color: t.textSecondary }]}>TARGET</Text>
                {!ex.isTimeBased && (
                  <Text style={[s.colHeader, s.colInput, { color: t.textSecondary }]}>WEIGHT</Text>
                )}
                <Text style={[s.colHeader, s.colInput, { color: t.textSecondary }]}>
                  {ex.isTimeBased ? 'SECS' : 'REPS'}
                </Text>
                <Text style={[s.colHeader, s.colRpe, { color: t.textSecondary }]}>RPE</Text>
                <View style={s.colCheck} />
              </View>

              {/* Set rows */}
              {ex.sets.map((set, setIdx) => (
                <View
                  key={setIdx}
                  style={[
                    s.setRow,
                    {
                      backgroundColor: set.completed ? `${accent.deep}10` : 'transparent',
                      borderTopColor: t.cardBorder,
                    },
                  ]}
                >
                  <Text style={[s.setNumber, s.colSet, { color: t.text }]}>{setIdx + 1}</Text>
                  <Text style={[s.targetText, s.colTarget, { color: t.textSecondary }]}>
                    {ex.targetReps[setIdx] ?? '-'}
                  </Text>
                  {!ex.isTimeBased && (
                    <TextInput
                      style={[
                        s.input,
                        s.colInput,
                        { color: t.text, backgroundColor: t.bg, borderColor: t.cardBorder },
                      ]}
                      value={set.weight}
                      onChangeText={(v) => updateSet(exIdx, setIdx, { weight: v })}
                      keyboardType="decimal-pad"
                      placeholder="lb"
                      placeholderTextColor={t.textSecondary}
                      editable={started}
                    />
                  )}
                  <TextInput
                    style={[
                      s.input,
                      s.colInput,
                      { color: t.text, backgroundColor: t.bg, borderColor: t.cardBorder },
                    ]}
                    value={set.reps}
                    onChangeText={(v) => updateSet(exIdx, setIdx, { reps: v })}
                    keyboardType="number-pad"
                    placeholder="-"
                    placeholderTextColor={t.textSecondary}
                    editable={started}
                  />
                  {/* RPE chip selector — shows recommended RPE as placeholder until user logs one */}
                  <TouchableOpacity
                    style={[
                      s.rpeBtn,
                      s.colRpe,
                      {
                        backgroundColor: set.rpe ? accent.deep : t.bg,
                        borderColor: set.rpe ? accent.deep : `${t.accent}60`,
                        borderStyle: set.rpe ? 'solid' : 'dashed',
                      },
                    ]}
                    disabled={!started}
                    onPress={() => {
                      // First tap = accept recommended. Then cycle 6 → 7 → 8 → 9 → 10 → null
                      const cycle = [null, 6, 7, 8, 9, 10];
                      if (set.rpe === null) {
                        updateSet(exIdx, setIdx, { rpe: ex.recommendedRpe });
                        return;
                      }
                      const currentIdx = cycle.indexOf(set.rpe as any);
                      const nextIdx = (currentIdx + 1) % cycle.length;
                      updateSet(exIdx, setIdx, { rpe: cycle[nextIdx] });
                    }}
                  >
                    <Text
                      style={[
                        s.rpeText,
                        { color: set.rpe ? '#fff' : t.accent },
                      ]}
                    >
                      {set.rpe ?? ex.recommendedRpe}
                    </Text>
                  </TouchableOpacity>
                  {/* Complete checkbox */}
                  <TouchableOpacity
                    style={[
                      s.checkBtn,
                      s.colCheck,
                      {
                        backgroundColor: set.completed ? accent.deep : t.bg,
                        borderColor: set.completed ? accent.deep : t.cardBorder,
                      },
                    ]}
                    disabled={!started}
                    onPress={() => updateSet(exIdx, setIdx, { completed: !set.completed })}
                  >
                    {set.completed ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : null}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))}

          {/* RPE legend */}
          {started && (
            <View style={[s.legendCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
              <Text style={[s.legendTitle, { color: t.text }]}>RPE Scale</Text>
              <Text style={[s.legendText, { color: t.textSecondary }]}>
                6 = light · 7 = moderate · 8 = hard · 9 = very hard · 10 = max effort
              </Text>
              <Text style={[s.legendText, { color: t.textSecondary, marginTop: 4 }]}>
                Each exercise shows a recommended RPE in the dashed chip. Tap once to accept, or keep tapping to cycle.
              </Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Rest countdown banner */}
        {started && restRemaining > 0 && (
          <View style={[s.restBanner, { backgroundColor: accent.deep }]}>
            <View style={s.restBannerHeader}>
              <View style={s.restBannerLabelRow}>
                <Ionicons name="hourglass" size={14} color="#fff" />
                <Text style={s.restBannerLabel}>REST</Text>
              </View>
              <Text style={s.restBannerTime}>{formatElapsed(restRemaining)}</Text>
            </View>
            <View style={s.restBannerTrack}>
              <View
                style={[
                  s.restBannerFill,
                  {
                    width: restTotal > 0
                      ? `${Math.max(0, (restRemaining / restTotal) * 100)}%`
                      : '0%',
                  },
                ]}
              />
            </View>
            <View style={s.restBannerActions}>
              <TouchableOpacity
                style={s.restBannerBtn}
                onPress={() => addRestTime(15)}
                activeOpacity={0.7}
              >
                <Text style={s.restBannerBtnText}>+15s</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.restBannerBtn}
                onPress={() => addRestTime(30)}
                activeOpacity={0.7}
              >
                <Text style={s.restBannerBtnText}>+30s</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.restBannerBtn, s.restBannerBtnSkip]}
                onPress={skipRest}
                activeOpacity={0.7}
              >
                <Text style={s.restBannerBtnText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bottom bar — finish */}
        {started && (
          <View style={[s.bottomBar, { backgroundColor: t.bg, borderTopColor: t.cardBorder }]}>
            <TouchableOpacity
              style={[s.finishBtn, { backgroundColor: accent.deep }]}
              onPress={handleFinish}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={s.finishBtnText}>Finish Workout</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
  },

  // Progress + Timer
  progressWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timerText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    fontFamily: 'DMSans-SemiBold',
  },

  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
  },

  // Pre-start summary
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  summaryIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  summaryTitle: {
    fontSize: 22,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
  },
  summarySub: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
    marginTop: 6,
  },
  summaryGoal: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.4,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    marginTop: 18,
  },
  startBtnText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
  },

  // Exercise card
  exerciseCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  exerciseNumber: {
    fontSize: 22,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
    width: 32,
  },
  exerciseName: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    lineHeight: 19,
  },
  exerciseMetaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  exerciseMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  exerciseMetaText: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  lastTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  lastTimeText: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    flex: 1,
  },

  // Column layout
  colHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    paddingHorizontal: 4,
    gap: 6,
  },
  colHeader: {
    fontSize: 9,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  colSet: { width: 22, textAlign: 'center' },
  colTarget: { width: 50, textAlign: 'center' },
  colInput: { flex: 1 },
  colRpe: { width: 36 },
  colCheck: { width: 32 },

  // Set row
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 6,
    borderTopWidth: 1,
  },
  setNumber: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
  },
  targetText: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
  },
  input: {
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
    textAlign: 'center',
  },
  rpeBtn: {
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpeText: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
  },
  checkBtn: {
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Legend
  legendCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  legendTitle: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
    marginBottom: 4,
  },
  legendText: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    lineHeight: 15,
  },

  // Rest banner
  restBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: 10,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  restBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  restBannerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  restBannerLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.8,
  },
  restBannerTime: {
    fontSize: 22,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  restBannerTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  restBannerFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  restBannerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  restBannerBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  restBannerBtnSkip: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  restBannerBtnText: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 28,
  },
  finishBtnText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
  },

  // Error state
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'DMSans-Bold',
  },
  errorDesc: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
  },
});
