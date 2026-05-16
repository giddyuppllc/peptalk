/**
 * Workout Player V2 — bespoke, set-by-set live workout experience.
 *
 * The redesign rule: it should feel like a coach standing next to you, not a
 * spreadsheet. One exercise at a time, the demo video looping next to a plain
 * coaching note, big "log this set" button with weight pre-filled from the
 * user's last session for the same lift, and a celebratory finish screen that
 * surfaces PRs and the week's progress instead of just dumping the user back
 * onto the workouts list.
 *
 * Drives off the same data the old player did:
 *   - `programId` + active program state from useWorkoutStore (Jamie's
 *      programs in workoutPrograms.ts)
 *   - `templateId` from useWorkoutTemplateStore (custom saved workouts)
 *
 * Set targets come from the underlying WorkoutDay; weight pre-fills from
 * useWorkoutStore.getExerciseHistory for the same exerciseId. PR detection
 * runs at finish — any set heavier than the user's previous best on that
 * exercise becomes a PR card on the celebration screen.
 *
 * Old player (app/workouts/player.tsx) is intentionally untouched. We'll
 * cut /workouts/program/[programId] over once Jamie signs off on this.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, BorderRadius, FontSizes } from '../../src/constants/theme';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useWorkoutTemplateStore } from '../../src/store/useWorkoutTemplateStore';
import { getProgramById } from '../../src/data/workoutPrograms';
import {
  getExerciseById,
  getExerciseInstructions,
} from '../../src/data/exercises';
import {
  fetchExerciseVideoUrl,
  hasExerciseVideo,
} from '../../src/services/videoService';
import type {
  ExerciseSet,
  WorkoutDay,
  WorkoutLogSet,
} from '../../src/types/fitness';
import { notifySuccess, tapLight, tapMedium } from '../../src/utils/haptics';

import {
  WorkoutProgressRing,
} from '../../src/components/workouts/WorkoutProgressRing';
import { SetDots, SetDotItem } from '../../src/components/workouts/SetDots';
import { RestTimer } from '../../src/components/workouts/RestTimer';
import {
  EndOfWorkoutCelebration,
  PRRecord,
} from '../../src/components/workouts/EndOfWorkoutCelebration';

// ───────────────────────────────────────────────────────────────────────────
// Helpers — coaching note, PR detection, weekly strip
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pull the first sentence of an exercise's "description" from
 * exerciseInstructions.json. Returns null if no entry exists — we never
 * fabricate copy. Trimmed to ~120 chars so it fits below the video.
 */
function coachingNoteFor(exerciseId: string): string | null {
  const inst = getExerciseInstructions(exerciseId);
  if (!inst?.description) return null;
  // First sentence — split on . or ; — keep it short.
  const firstStop = inst.description.search(/[.;]\s/);
  const sentence =
    firstStop > 0 ? inst.description.slice(0, firstStop + 1) : inst.description;
  return sentence.length > 120 ? sentence.slice(0, 117) + '…' : sentence;
}

/** Round to nearest 5 lb, with a 0-lb floor. */
function snap5(n: number): number {
  return Math.max(0, Math.round(n / 5) * 5);
}

/** ISO-week Monday → Sunday day labels */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weekDates(today: Date): string[] {
  const dow = today.getDay(); // 0=Sun..6=Sat
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offsetToMonday + i);
    return d.toISOString().slice(0, 10);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Video block — autoplay-on-load inline player
// ───────────────────────────────────────────────────────────────────────────

function ExerciseVideoBlock({
  exerciseId,
  borderColor,
  textColor,
  textMutedColor,
}: {
  exerciseId: string;
  borderColor: string;
  textColor: string;
  textMutedColor: string;
}) {
  const has = hasExerciseVideo(exerciseId);
  const videoRef = useRef<Video>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'placeholder'>(
    has ? 'loading' : 'placeholder',
  );

  useEffect(() => {
    let cancelled = false;
    if (!has) return;
    setStatus('loading');
    setUrl(null);
    (async () => {
      const r = await fetchExerciseVideoUrl(exerciseId);
      if (cancelled) return;
      if (r?.videoUrl) {
        setUrl(r.videoUrl);
        setStatus('ready');
      } else {
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exerciseId, has]);

  const handleStatus = (s: AVPlaybackStatus) => {
    if (!s.isLoaded && s.error) setStatus('error');
  };

  return (
    <View
      style={[styles.videoFrame, { borderColor }]}
      accessibilityRole="image"
      accessibilityLabel={`Demonstration video for ${exerciseId.replace(/-/g, ' ')}`}
    >
      {status === 'placeholder' && (
        <View style={styles.videoFallback}>
          <Ionicons name="videocam-outline" size={32} color={textMutedColor} />
          <Text style={[styles.videoFallbackText, { color: textMutedColor }]}>
            Video coming soon
          </Text>
        </View>
      )}
      {status === 'loading' && (
        <View style={styles.videoFallback}>
          <ActivityIndicator color={textColor} />
        </View>
      )}
      {status === 'error' && (
        <View style={styles.videoFallback}>
          <Ionicons name="alert-circle-outline" size={28} color={textMutedColor} />
          <Text style={[styles.videoFallbackText, { color: textMutedColor }]}>
            Video unavailable
          </Text>
        </View>
      )}
      {status === 'ready' && url && (
        <Video
          ref={videoRef}
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted
          onPlaybackStatusUpdate={handleStatus}
        />
      )}
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// "Just-logged" toast — slides in on logSet success
// ───────────────────────────────────────────────────────────────────────────

function LoggedToast({
  message,
  visible,
  accent,
}: {
  message: string;
  visible: boolean;
  accent: string;
}) {
  const opacity = useSharedValue(0);
  const ty = useSharedValue(8);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 220 });
    ty.value = withSpring(visible ? 0 : 8, { damping: 16, stiffness: 220 });
  }, [visible, opacity, ty]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: accent + 'EE' },
        style,
      ]}
      pointerEvents="none"
    >
      <Ionicons name="checkmark-circle" size={16} color="#fff" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Main Screen
// ───────────────────────────────────────────────────────────────────────────

interface LoggedSetMeta {
  exerciseId: string;
  setIndex: number;
  reps: number;
  weightLbs: number | null;
}

export default function WorkoutPlayerV2Screen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();

  const params = useLocalSearchParams<{
    programId?: string;
    templateId?: string;
  }>();
  const programId = params.programId;
  const templateId = params.templateId;

  const program = programId ? getProgramById(programId) : undefined;
  const template = templateId
    ? useWorkoutTemplateStore.getState().getTemplateById(templateId)
    : undefined;

  const {
    activeProgram,
    inProgress,
    beginWorkout,
    logSet,
    finishWorkout,
    cancelWorkout,
    advanceDay,
    getExerciseHistory,
    logs,
  } = useWorkoutStore();

  // Build the WorkoutDay we're playing through. Templates become a virtual
  // single-day program; programs use the day at (currentWeek, currentDay).
  const day: WorkoutDay | null = useMemo(() => {
    if (template) {
      return {
        id: `tmpl-${template.id}`,
        name: template.name,
        code: 'Custom',
        exercises: template.exercises.map((te) => ({
          exerciseId: te.exerciseId,
          reps: Array(te.targetSets).fill(te.targetReps),
          setType: 'normal',
          restSeconds: te.restSeconds,
        })) as ExerciseSet[],
      };
    }
    if (program) {
      const w = activeProgram?.currentWeek ?? 1;
      const d = activeProgram?.currentDay ?? 0;
      return program.weeks[w - 1]?.days[d] ?? null;
    }
    return null;
  }, [program, template, activeProgram]);

  // Begin a workout once on mount
  const beganRef = useRef(false);
  useEffect(() => {
    if (beganRef.current || !day) return;
    beganRef.current = true;
    if (!inProgress) {
      beginWorkout(
        programId,
        activeProgram?.currentWeek,
        day.id,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // Set-by-set position
  const [exIdx, setExIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [logged, setLogged] = useState<LoggedSetMeta[]>([]);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [workoutStart] = useState(() => Date.now());

  // Per-exercise weight (sticks across sets); seeded from last session
  const [weightByExercise, setWeightByExercise] = useState<Record<string, number>>({});

  const currentEx: ExerciseSet | null = day?.exercises[exIdx] ?? null;
  const currentExId = currentEx?.exerciseId;
  const currentExInfo = currentExId ? getExerciseById(currentExId) : undefined;
  const currentExName = currentExInfo?.name ?? currentExId ?? '';
  const currentExNote = currentExId ? coachingNoteFor(currentExId) : null;
  const isTimeBased = currentExInfo?.isTimeBased ?? false;
  const targetReps = currentEx?.reps[setIdx] ?? 0;
  const targetSeconds = currentEx?.timeSeconds;

  // Seed weight when exercise changes
  useEffect(() => {
    if (!currentExId) return;
    if (weightByExercise[currentExId] != null) return;
    const history = getExerciseHistory(currentExId);
    const seed = history?.bestWeight ?? 0;
    setWeightByExercise((prev) => ({ ...prev, [currentExId]: snap5(seed) }));
  }, [currentExId, getExerciseHistory, weightByExercise]);

  const currentWeight = currentExId ? weightByExercise[currentExId] ?? 0 : 0;

  // Totals
  const totalSets = useMemo(
    () => (day?.exercises.reduce((n, e) => n + e.reps.length, 0) ?? 0),
    [day],
  );
  const completedSets = logged.length;
  const progress = totalSets > 0 ? completedSets / totalSets : 0;

  // Set list for the SetDots component on the *current* exercise
  const setDotsItems: SetDotItem[] = useMemo(() => {
    if (!currentEx) return [];
    return currentEx.reps.map((rep, i) => {
      const loggedHere = logged.find(
        (l) => l.exerciseId === currentEx.exerciseId && l.setIndex === i,
      );
      let status: 'done' | 'current' | 'upcoming' = 'upcoming';
      if (loggedHere) status = 'done';
      else if (i === setIdx) status = 'current';
      return {
        targetReps: isTimeBased ? null : rep,
        targetSeconds: isTimeBased ? targetSeconds : undefined,
        loggedReps: loggedHere?.reps,
        loggedWeight: loggedHere?.weightLbs ?? undefined,
        status,
      };
    });
  }, [currentEx, logged, setIdx, isTimeBased, targetSeconds]);

  // ─────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────

  const adjustWeight = (delta: number) => {
    if (!currentExId) return;
    tapLight();
    setWeightByExercise((prev) => ({
      ...prev,
      [currentExId]: Math.max(0, (prev[currentExId] ?? 0) + delta),
    }));
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  const handleLogSet = useCallback(() => {
    if (!currentEx || !day) return;
    tapMedium();
    const reps = isTimeBased ? 1 : targetReps;
    const log: WorkoutLogSet = {
      exerciseId: currentEx.exerciseId,
      setNumber: setIdx + 1,
      reps,
      weightLbs: currentWeight > 0 ? currentWeight : undefined,
      durationSeconds: isTimeBased ? targetSeconds : undefined,
      completed: true,
    };
    logSet(log);
    notifySuccess();
    setLogged((prev) => [
      ...prev,
      {
        exerciseId: currentEx.exerciseId,
        setIndex: setIdx,
        reps,
        weightLbs: currentWeight > 0 ? currentWeight : null,
      },
    ]);

    const isLastSetOfExercise = setIdx + 1 >= currentEx.reps.length;
    const isLastExercise = exIdx + 1 >= day.exercises.length;

    if (isLastSetOfExercise && isLastExercise) {
      // Done!
      showToast('Workout complete');
      setCelebrate(true);
      return;
    }

    // Start rest if configured
    const rest = currentEx.restSeconds ?? 0;
    if (rest > 0) setRestRemaining(rest);

    // Advance set or exercise
    if (isLastSetOfExercise) {
      showToast(`Coming up: ${day.exercises[exIdx + 1]?.exerciseId.replace(/-/g, ' ') ?? 'next exercise'}`);
      setExIdx((i) => i + 1);
      setSetIdx(0);
    } else {
      showToast(`Logged: ${reps} reps${currentWeight ? ` × ${currentWeight} lb` : ''}`);
      setSetIdx((i) => i + 1);
    }
  }, [
    currentEx,
    day,
    isTimeBased,
    targetReps,
    targetSeconds,
    setIdx,
    exIdx,
    currentWeight,
    logSet,
  ]);

  const handleSkipExercise = () => {
    if (!day) return;
    if (exIdx + 1 >= day.exercises.length) {
      Alert.alert('Skip last exercise?', 'You\'ll go straight to the wrap-up.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: () => setCelebrate(true),
        },
      ]);
      return;
    }
    tapMedium();
    setRestRemaining(null);
    setExIdx((i) => i + 1);
    setSetIdx(0);
    showToast('Skipped exercise');
  };

  const handleSkipWorkout = () => {
    Alert.alert('Skip workout?', 'This session won\'t be saved.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Skip',
        style: 'destructive',
        onPress: () => {
          cancelWorkout();
          router.back();
        },
      },
    ]);
  };

  const handleFinishFromCelebration = () => {
    finishWorkout(undefined, undefined, undefined, template?.name);
    if (template) useWorkoutTemplateStore.getState().markUsed(template.id);
    if (!templateId && programId && activeProgram) advanceDay();
    router.replace('/(tabs)/train' as never);
  };

  // ─────────────────────────────────────────────────────────────────────
  // Derived data for the celebration
  // ─────────────────────────────────────────────────────────────────────

  const prs: PRRecord[] = useMemo(() => {
    if (!celebrate || !day) return [];
    const out: PRRecord[] = [];
    const seen = new Set<string>();
    for (const l of logged) {
      if (l.weightLbs == null || l.weightLbs <= 0) continue;
      if (seen.has(l.exerciseId)) continue;
      // Compute *previous* best (before this session). The store's
      // getExerciseHistory now includes our just-logged sets via the
      // inProgress workout log, so we filter those out manually.
      const allHistorySets = logs.flatMap((log) =>
        log.sets
          .filter((s) => s.exerciseId === l.exerciseId)
          .map((s) => s.weightLbs ?? 0),
      );
      const prevBest = allHistorySets.length ? Math.max(...allHistorySets) : 0;
      const sessionBest = Math.max(
        ...logged
          .filter((x) => x.exerciseId === l.exerciseId)
          .map((x) => x.weightLbs ?? 0),
      );
      if (sessionBest > prevBest && sessionBest > 0) {
        const info = getExerciseById(l.exerciseId);
        out.push({
          exerciseName: info?.name ?? l.exerciseId,
          previousLbs: prevBest > 0 ? prevBest : null,
          newLbs: sessionBest,
        });
        seen.add(l.exerciseId);
      }
    }
    return out;
  }, [celebrate, day, logged, logs]);

  const week = useMemo(() => {
    if (!celebrate) return [];
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const dates = weekDates(today);
    return dates.map((dateKey, i) => {
      const dayWorkouts = logs.filter((l) => l.date === dateKey);
      const isToday = dateKey === todayKey;
      const state: 'done' | 'today' | 'planned' | 'rest' =
        dayWorkouts.length > 0 || isToday
          ? isToday
            ? 'today'
            : 'done'
          : i >= 5
            ? 'rest'
            : 'planned';
      return { label: DAY_LABELS[i], state };
    });
  }, [celebrate, logs]);

  // Estimated calories — rough industry heuristic, 5 cal/min moderate
  const durationMinutes = Math.max(1, Math.round((Date.now() - workoutStart) / 60000));
  const estimatedCalories = durationMinutes * 5;

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  if (!day) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
        <View style={styles.fallback}>
          <Ionicons name="alert-circle" size={48} color={t.textMuted} />
          <Text style={[styles.fallbackTitle, { color: t.text }]}>
            No workout to play
          </Text>
          <Text style={[styles.fallbackSub, { color: t.textSecondary }]}>
            Pick a program or saved workout from the Train tab to get started.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.fallbackBtn, { backgroundColor: accent.deep }]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.fallbackBtnLabel}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (celebrate) {
    return (
      <EndOfWorkoutCelebration
        workoutName={day.name}
        totalSets={completedSets}
        durationMinutes={durationMinutes}
        estimatedCalories={estimatedCalories}
        prs={prs}
        week={week}
        weekProgress={{
          done: week.filter((d) => d.state === 'done' || d.state === 'today').length,
          target: 4,
        }}
        accentColor={accent.deep}
        accentSoft={accent.pastel}
        textColor={t.text}
        textMutedColor={t.textSecondary}
        surfaceColor={t.surface}
        borderColor={t.cardBorder}
        bgColor={t.bg}
        onDone={handleFinishFromCelebration}
      />
    );
  }

  const sectionLabel = template
    ? template.name
    : program?.category?.[0]?.replace(/_/g, ' ').toUpperCase() ?? 'WORKOUT';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerEyebrow, { color: t.textMuted }]}>
              {sectionLabel}
            </Text>
            <Text style={[styles.headerTitle, { color: t.text }]} numberOfLines={1}>
              {day.name}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleSkipWorkout}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Close workout"
          >
            <Ionicons name="close" size={26} color={t.text} />
          </TouchableOpacity>
        </View>

        {/* Progress ring */}
        <View style={styles.ringWrap}>
          <WorkoutProgressRing
            progress={progress}
            currentExercise={exIdx + 1}
            totalExercises={day.exercises.length}
            color={accent.deep}
            textColor={t.text}
            textMutedColor={t.textSecondary}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Video */}
          {currentExId && (
            <ExerciseVideoBlock
              exerciseId={currentExId}
              borderColor={t.cardBorder}
              textColor={t.text}
              textMutedColor={t.textSecondary}
            />
          )}

          {/* Exercise name + coaching note */}
          <Text
            style={[styles.exerciseName, { color: t.text }]}
            accessibilityRole="header"
          >
            {currentExName.toUpperCase()}
          </Text>
          {currentExNote && (
            <Text
              style={[styles.coachingNote, { color: t.textSecondary }]}
              accessibilityLabel={`Coaching note: ${currentExNote}`}
            >
              {currentExNote}
            </Text>
          )}

          {/* This workout */}
          <SectionLabel label="This workout" color={t.textMuted} />
          <SetDots
            sets={setDotsItems}
            accentColor={accent.deep}
            textColor={t.text}
            textMutedColor={t.textSecondary}
            surfaceColor={t.surface}
            borderColor={t.cardBorder}
          />

          {/* Rest timer (only when rest is active) */}
          {restRemaining != null && restRemaining > 0 && (
            <View style={{ marginTop: Spacing.md }}>
              <RestTimer
                durationSeconds={restRemaining}
                accentColor={accent.deep}
                textColor={t.text}
                textMutedColor={t.textSecondary}
                surfaceColor={t.surface}
                borderColor={t.cardBorder}
                onComplete={() => setRestRemaining(null)}
                onSkip={() => setRestRemaining(null)}
                label="Rest"
              />
            </View>
          )}

          {/* Weight stepper */}
          {!isTimeBased && (
            <View style={[styles.weightRow, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
              <TouchableOpacity
                onPress={() => adjustWeight(-5)}
                style={[styles.stepBtn, { borderColor: t.cardBorder }]}
                accessibilityRole="button"
                accessibilityLabel="Decrease weight by 5 pounds"
              >
                <Ionicons name="remove" size={20} color={t.text} />
              </TouchableOpacity>
              <View style={styles.weightCol}>
                <Text style={[styles.weightValue, { color: t.text }]}>
                  {currentWeight || 0}
                </Text>
                <Text style={[styles.weightUnit, { color: t.textMuted }]}>
                  lb
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => adjustWeight(5)}
                style={[styles.stepBtn, { borderColor: t.cardBorder }]}
                accessibilityRole="button"
                accessibilityLabel="Increase weight by 5 pounds"
              >
                <Ionicons name="add" size={20} color={t.text} />
              </TouchableOpacity>
            </View>
          )}

          {/* Big primary button */}
          <TouchableOpacity
            onPress={handleLogSet}
            activeOpacity={0.9}
            style={styles.primaryWrap}
            accessibilityRole="button"
            accessibilityLabel={
              isTimeBased
                ? `Log this set, ${targetSeconds} second hold`
                : `Log this set, ${targetReps} reps at ${currentWeight} pounds`
            }
          >
            <LinearGradient
              colors={[accent.deep, accent.deep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryGrad}
            >
              <Text style={styles.primaryLabel}>
                LOG THIS SET
                {!isTimeBased && currentWeight > 0 ? ` — ${currentWeight} LB` : ''}
                {isTimeBased && targetSeconds ? ` — ${targetSeconds}s` : ''}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Coming up */}
          <SectionLabel label="Coming up" color={t.textMuted} />
          <View style={styles.comingUpRow}>
            {day.exercises.slice(exIdx + 1).slice(0, 6).map((ex, i) => {
              const info = getExerciseById(ex.exerciseId);
              return (
                <View
                  key={`${ex.exerciseId}-${i}`}
                  style={[
                    styles.comingDot,
                    { borderColor: t.cardBorder, backgroundColor: t.surface },
                  ]}
                  accessibilityLabel={`Up next: ${info?.name ?? ex.exerciseId}`}
                >
                  <Text style={[styles.comingNum, { color: t.textSecondary }]}>
                    {exIdx + 2 + i}
                  </Text>
                </View>
              );
            })}
            {day.exercises.slice(exIdx + 1).length === 0 && (
              <Text style={[styles.comingEmpty, { color: t.textMuted }]}>
                Last one — finish strong.
              </Text>
            )}
          </View>

          {/* Skip exercise */}
          <TouchableOpacity
            onPress={handleSkipExercise}
            style={[styles.skipBtn, { borderColor: t.cardBorder }]}
            accessibilityRole="button"
            accessibilityLabel="Skip this exercise"
          >
            <Ionicons name="play-skip-forward-outline" size={16} color={t.textSecondary} />
            <Text style={[styles.skipLabel, { color: t.textSecondary }]}>
              Skip exercise
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <LoggedToast
          message={toast ?? ''}
          visible={!!toast}
          accent={accent.deep}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={[styles.sectionLabelLine, { backgroundColor: color + '33' }]} />
      <Text style={[styles.sectionLabelText, { color }]}>{label.toUpperCase()}</Text>
      <View style={[styles.sectionLabelLine, { backgroundColor: color + '33' }]} />
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: Spacing.lg,
  },
  fallbackTitle: {
    fontSize: 22,
    fontFamily: 'Playfair-Bold',
  },
  fallbackSub: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
    fontFamily: 'DMSans-Regular',
  },
  fallbackBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 8,
  },
  fallbackBtnLabel: { color: '#fff', fontFamily: 'DMSans-SemiBold' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  headerEyebrow: {
    fontSize: 10,
    fontFamily: 'DMSans-SemiBold',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Playfair-Bold',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  ringWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },

  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 64,
  },

  videoFrame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  videoFallback: {
    alignItems: 'center',
    gap: 6,
  },
  videoFallbackText: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-Medium',
  },

  exerciseName: {
    fontSize: 22,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 1,
    marginBottom: 6,
  },
  coachingNote: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-Regular',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },

  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionLabelLine: { flex: 1, height: 1 },
  sectionLabelText: {
    fontSize: 10,
    fontFamily: 'DMSans-SemiBold',
    letterSpacing: 1.5,
  },

  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightCol: { alignItems: 'center' },
  weightValue: {
    fontSize: 36,
    fontFamily: 'DMSans-Bold',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  weightUnit: {
    fontSize: FontSizes.xs,
    fontFamily: 'DMSans-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: -2,
  },

  primaryWrap: {
    marginTop: Spacing.md,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  primaryGrad: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 1.2,
  },

  comingUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  comingDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingNum: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-SemiBold',
  },
  comingEmpty: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-Medium',
    fontStyle: 'italic',
  },

  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
    marginTop: Spacing.lg,
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
  },
  skipLabel: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-Medium',
  },

  toast: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastText: {
    color: '#fff',
    fontFamily: 'DMSans-SemiBold',
    fontSize: FontSizes.sm,
  },
});
