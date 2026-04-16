/**
 * Workout Player — live workout experience with set tracking.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ExerciseVideo } from '../../src/components/ExerciseVideo';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { getProgramById } from '../../src/data/workoutPrograms';
import { getExerciseById } from '../../src/data/exercises';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import type { ExerciseSet } from '../../src/types/fitness';
import { PaywallGate } from '../../src/hooks/useFeatureGate';

// ---------------------------------------------------------------------------
// YouTube helpers
// ---------------------------------------------------------------------------

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function YouTubeCard({ url, onRemove }: { url: string; onRemove?: () => void }) {
  const videoId = extractYouTubeId(url);
  const thumbUri = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => Linking.openURL(url).catch(() => {})}
      style={styles.ytCard}
    >
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={styles.ytThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.ytThumb, styles.ytThumbPlaceholder]}>
          <Ionicons name="logo-youtube" size={32} color="#ef4444" />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={styles.ytOverlay}
      />
      <View style={styles.ytPlayBadge}>
        <Ionicons name="logo-youtube" size={18} color="#ef4444" />
        <Text style={styles.ytPlayText}>Tap to watch</Text>
      </View>
      {onRemove && (
        <TouchableOpacity style={styles.ytRemove} onPress={onRemove} hitSlop={10}>
          <Ionicons name="close-circle" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// YouTube URL Input Card
// ---------------------------------------------------------------------------

function YouTubeInputCard({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const videoId = extractYouTubeId(value);

  return (
    <View style={styles.ytInputSection}>
      {!expanded && !videoId ? (
        <TouchableOpacity
          style={styles.ytAttachBtn}
          onPress={() => setExpanded(true)}
          activeOpacity={0.75}
        >
          <Ionicons name="logo-youtube" size={20} color="#ef4444" />
          <Text style={styles.ytAttachText}>Attach YouTube Video</Text>
          <Ionicons name="chevron-down" size={16} color={Colors.darkTextSecondary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.ytInputWrap}>
          <Ionicons name="logo-youtube" size={20} color="#ef4444" style={{ marginTop: 14 }} />
          <TextInput
            style={styles.ytInput}
            placeholder="Paste YouTube URL..."
            placeholderTextColor="#6b7280"
            value={value}
            onChangeText={onChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {value.length > 0 && (
            <TouchableOpacity onPress={() => { onChange(''); setExpanded(false); }} style={{ marginTop: 12 }}>
              <Ionicons name="close-circle" size={20} color={Colors.darkTextSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}
      {videoId && value.length > 0 && (
        <YouTubeCard url={value} onRemove={() => { onChange(''); setExpanded(false); }} />
      )}
      {value.length > 0 && !videoId && (
        <Text style={styles.ytError}>Couldn't detect a YouTube video ID — check the URL</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Timer Hook
// ---------------------------------------------------------------------------

function useTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = () => setRunning(true);
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false);
    setSeconds(0);
  };

  const formatted = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  return { seconds, formatted, running, start, pause, reset };
}

// ---------------------------------------------------------------------------
// Rest Timer Hook (countdown)
// ---------------------------------------------------------------------------

function useRestTimer() {
  const [remaining, setRemaining] = useState(0);
  const [active, setActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || remaining <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (remaining <= 0) setActive(false);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setActive(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, remaining]);

  const startCountdown = (seconds: number) => {
    setRemaining(seconds);
    setActive(true);
  };

  const cancel = () => {
    setActive(false);
    setRemaining(0);
  };

  const formatted = `${Math.floor(remaining / 60)
    .toString()
    .padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;

  return { remaining, active, formatted, startCountdown, cancel };
}

// ---------------------------------------------------------------------------
// Set Input Data
// ---------------------------------------------------------------------------

type SetInputData = Record<string, { weight: string; reps: string }>;

function ExerciseRow({
  exerciseSet,
  index,
  completedSets,
  onToggleSet,
  setInputs,
  onSetInput,
  restTimer,
}: {
  exerciseSet: ExerciseSet;
  index: number;
  completedSets: Set<string>;
  onToggleSet: (key: string, restSeconds?: number) => void;
  setInputs: SetInputData;
  onSetInput: (key: string, field: 'weight' | 'reps', value: string) => void;
  restTimer: ReturnType<typeof useRestTimer>;
}) {
  const info = getExerciseById(exerciseSet.exerciseId);
  const name = info?.name ?? exerciseSet.exerciseId;
  const isTimeBased = info?.isTimeBased ?? false;
  const [videoExpanded, setVideoExpanded] = useState(false);

  return (
    <View style={styles.exRow}>
      {/* Exercise header */}
      <View style={styles.exHeader}>
        <View style={styles.exNumBadge}>
          <Text style={styles.exNum}>{index + 1}</Text>
        </View>
        <View style={styles.exInfo}>
          <TouchableOpacity
            style={styles.exNameTouchable}
            onPress={() => setVideoExpanded((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.exName}>{name}</Text>
            <Ionicons
              name={videoExpanded ? 'videocam' : 'videocam-outline'}
              size={16}
              color={videoExpanded ? Colors.pepTeal : Colors.darkTextSecondary}
              style={{ marginLeft: 6 }}
            />
          </TouchableOpacity>
          {exerciseSet.setType !== 'normal' && (
            <View style={styles.setTypeBadge}>
              <Text style={styles.setTypeText}>
                {exerciseSet.setType === 'super_set'
                  ? 'Super Set'
                  : exerciseSet.setType === 'super_set_2'
                  ? 'Super Set 2'
                  : exerciseSet.setType}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Video expand section */}
      {videoExpanded && (
        <View style={styles.videoSection}>
          <ExerciseVideo exerciseId={exerciseSet.exerciseId} compact />
        </View>
      )}

      {/* Sets */}
      <View style={styles.setsColumn}>
        {exerciseSet.reps.map((rep, setIdx) => {
          const key = `${index}-${setIdx}`;
          const done = completedSets.has(key);
          const inputData = setInputs[key] ?? { weight: '', reps: '' };
          return (
            <View key={setIdx} style={styles.setRow}>
              {/* Toggle button */}
              <TouchableOpacity
                style={[styles.setCell, done && styles.setCellDone]}
                onPress={() => onToggleSet(key, exerciseSet.restSeconds)}
                activeOpacity={0.7}
              >
                {done ? (
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                ) : (
                  <Ionicons
                    name="ellipse-outline"
                    size={18}
                    color={Colors.darkTextSecondary}
                  />
                )}
                <Text style={[styles.setText, done && styles.setTextDone]}>
                  Set {setIdx + 1}
                </Text>
                <Text style={[styles.repText, done && styles.repTextDone]}>
                  {isTimeBased && exerciseSet.timeSeconds
                    ? `${exerciseSet.timeSeconds}s`
                    : `${rep} reps`}
                </Text>
              </TouchableOpacity>

              {/* Weight / Reps inputs */}
              <View style={styles.inputGroup}>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.setInput, done && styles.setInputDone]}
                    placeholder="lbs"
                    placeholderTextColor="rgba(0,0,0,0.15)"
                    keyboardType="numeric"
                    value={inputData.weight}
                    onChangeText={(v) => onSetInput(key, 'weight', v)}
                  />
                </View>
                {!isTimeBased && (
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[styles.setInput, done && styles.setInputDone]}
                      placeholder={`${rep}`}
                      placeholderTextColor="rgba(0,0,0,0.15)"
                      keyboardType="numeric"
                      value={inputData.reps}
                      onChangeText={(v) => onSetInput(key, 'reps', v)}
                    />
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Rest timer countdown */}
      {restTimer.active && (
        <TouchableOpacity style={styles.restTimerRow} onPress={restTimer.cancel} activeOpacity={0.7}>
          <Ionicons name="timer" size={16} color={Colors.pepTeal} />
          <Text style={styles.restTimerText}>
            Rest: {restTimer.formatted}
          </Text>
          <Text style={styles.restTimerSkip}>Tap to skip</Text>
        </TouchableOpacity>
      )}

      {/* Rest indicator (static) */}
      {!restTimer.active && exerciseSet.restSeconds != null && exerciseSet.restSeconds > 0 && (
        <View style={styles.restRow}>
          <Ionicons name="timer-outline" size={14} color={Colors.darkTextSecondary} />
          <Text style={styles.restText}>
            Rest: {exerciseSet.restSeconds}s
          </Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Free Workout Logger (no program) — lets user log own exercises + YouTube
// ---------------------------------------------------------------------------

interface FreeExerciseEntry {
  id: string;
  name: string;
  sets: string;
  reps: string;
  weight: string;
}

function FreeWorkoutScreen() {
  const router = useRouter();
  const { beginWorkout, finishWorkout, cancelWorkout, inProgress } = useWorkoutStore();
  const timer = useTimer();

  const [workoutName, setWorkoutName] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<FreeExerciseEntry[]>([
    { id: '1', name: '', sets: '3', reps: '10', weight: '' },
  ]);

  useEffect(() => {
    if (!inProgress) beginWorkout(undefined, undefined, undefined);
    timer.start();
    return () => timer.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addExercise = () => {
    setExercises((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', sets: '3', reps: '10', weight: '' },
    ]);
  };

  const removeExercise = (id: string) => {
    setExercises((prev) => prev.filter((e) => e.id !== id));
  };

  const updateExercise = (id: string, field: keyof FreeExerciseEntry, val: string) => {
    setExercises((prev) => prev.map((e) => e.id === id ? { ...e, [field]: val } : e));
  };

  const handleFinish = () => {
    const ytId = extractYouTubeId(youtubeUrl);
    Alert.alert(
      'Workout Complete!',
      `${Math.floor(timer.seconds / 60)} min logged. What's next?`,
      [
        {
          text: 'Log Meal',
          onPress: () => {
            timer.pause();
            finishWorkout(undefined, notes || undefined, ytId ? youtubeUrl : undefined, workoutName || undefined);
            router.replace('/nutrition');
          },
        },
        {
          text: 'Check In',
          onPress: () => {
            timer.pause();
            finishWorkout(undefined, notes || undefined, ytId ? youtubeUrl : undefined, workoutName || undefined);
            router.replace('/(tabs)/check-in');
          },
        },
        {
          text: 'Save & Exit',
          onPress: () => {
            timer.pause();
            finishWorkout(undefined, notes || undefined, ytId ? youtubeUrl : undefined, workoutName || undefined);
            router.back();
          },
        },
      ],
    );
  };

  const handleQuit = () => {
    Alert.alert('Discard Workout?', 'Nothing will be saved.', [
      { text: 'Keep Going', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { timer.pause(); cancelWorkout(); router.back(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleQuit} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Log Workout</Text>
          <Text style={styles.headerTimer}>{timer.formatted}</Text>
        </View>
        <TouchableOpacity
          onPress={() => (timer.running ? timer.pause() : timer.start())}
          style={styles.backBtn}
        >
          <Ionicons name={timer.running ? 'pause' : 'play'} size={22} color={Colors.pepTeal} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Workout name */}
        <View style={styles.freeSection}>
          <TextInput
            style={styles.freeNameInput}
            placeholder="Workout name (optional)"
            placeholderTextColor="#6b7280"
            value={workoutName}
            onChangeText={setWorkoutName}
          />
        </View>

        {/* YouTube video link */}
        <View style={styles.freeSection}>
          <Text style={styles.freeSectionLabel}>Reference Video</Text>
          <YouTubeInputCard value={youtubeUrl} onChange={setYoutubeUrl} />
        </View>

        {/* Exercises */}
        <View style={styles.freeSection}>
          <View style={styles.freeSectionRow}>
            <Text style={styles.freeSectionLabel}>Exercises</Text>
            <TouchableOpacity onPress={addExercise} style={styles.addExBtn}>
              <Ionicons name="add" size={18} color={Colors.pepTeal} />
              <Text style={styles.addExText}>Add</Text>
            </TouchableOpacity>
          </View>

          {exercises.map((ex, i) => (
            <GlassCard key={ex.id} style={{ marginBottom: 10 }}>
              <View style={styles.freeExHeader}>
                <Text style={styles.freeExNum}>{i + 1}</Text>
                <TextInput
                  style={styles.freeExNameInput}
                  placeholder="Exercise name"
                  placeholderTextColor="#6b7280"
                  value={ex.name}
                  onChangeText={(v) => updateExercise(ex.id, 'name', v)}
                />
                {exercises.length > 1 && (
                  <TouchableOpacity onPress={() => removeExercise(ex.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.freeExFields}>
                <View style={styles.freeExField}>
                  <Text style={styles.freeExFieldLabel}>Sets</Text>
                  <TextInput
                    style={styles.freeExInput}
                    value={ex.sets}
                    onChangeText={(v) => updateExercise(ex.id, 'sets', v.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.freeExField}>
                  <Text style={styles.freeExFieldLabel}>Reps</Text>
                  <TextInput
                    style={styles.freeExInput}
                    value={ex.reps}
                    onChangeText={(v) => updateExercise(ex.id, 'reps', v.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.freeExField}>
                  <Text style={styles.freeExFieldLabel}>Weight</Text>
                  <TextInput
                    style={styles.freeExInput}
                    placeholder="lbs"
                    placeholderTextColor="#6b7280"
                    value={ex.weight}
                    onChangeText={(v) => updateExercise(ex.id, 'weight', v.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </GlassCard>
          ))}
        </View>

        {/* Notes */}
        <View style={styles.freeSection}>
          <Text style={styles.freeSectionLabel}>Notes</Text>
          <TextInput
            style={styles.freeNotesInput}
            placeholder="How did it feel? Any PRs?"
            placeholderTextColor="#6b7280"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.finishSection}>
          <GradientButton
            label="Finish Workout"
            onPress={handleFinish}
            colors={[Colors.pepTeal, Colors.pepBlue]}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Main Screen — routes to FreeWorkoutScreen or program player
// ---------------------------------------------------------------------------

export default function WorkoutPlayerScreen() {
  const router = useRouter();
  const { programId } = useLocalSearchParams<{ programId: string }>();
  const program = getProgramById(programId ?? '');
  const {
    activeProgram,
    beginWorkout,
    finishWorkout,
    cancelWorkout,
    advanceDay,
    inProgress,
  } = useWorkoutStore();

  const timer = useTimer();
  const restTimer = useRestTimer();
  const [completedSets, setCompletedSets] = useState<Set<string>>(new Set());
  const [setInputs, setSetInputs] = useState<SetInputData>({});
  const [youtubeUrl, setYoutubeUrl] = useState('');

  // Determine current day
  const currentWeek = activeProgram?.currentWeek ?? 1;
  const currentDayIdx = activeProgram?.currentDay ?? 0;
  const week = program?.weeks[(currentWeek - 1)] ?? null;
  const day = week?.days[currentDayIdx] ?? null;

  // Free workout mode (no programId)
  if (!programId) {
    return <FreeWorkoutScreen />;
  }

  // Program complete
  if (!program || !day) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
          <Text style={styles.doneTitle}>Program Complete!</Text>
          <Text style={styles.doneDesc}>You've finished all available workouts.</Text>
          <GradientButton label="Back to Workouts" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (day && !inProgress) {
      beginWorkout(programId, currentWeek, day.id);
    }
    timer.start();
    return () => timer.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSets = day?.exercises.reduce((sum, e) => sum + e.reps.length, 0) ?? 0;

  const handleToggleSet = (key: string, restSeconds?: number) => {
    setCompletedSets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        restTimer.cancel();
      } else {
        next.add(key);
        if (restSeconds && restSeconds > 0) restTimer.startCountdown(restSeconds);
      }
      return next;
    });
  };

  const handleSetInput = (key: string, field: 'weight' | 'reps', value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    setSetInputs((prev) => ({
      ...prev,
      [key]: { weight: prev[key]?.weight ?? '', reps: prev[key]?.reps ?? '', [field]: cleaned },
    }));
  };

  const handleFinish = () => {
    const ytId = extractYouTubeId(youtubeUrl);
    Alert.alert(
      'Workout Complete!',
      `Great session! ${Math.floor(timer.seconds / 60)} minutes of effort logged.\n\nWhat's next?`,
      [
        {
          text: 'Log Meal',
          onPress: () => { timer.pause(); finishWorkout(undefined, undefined, ytId ? youtubeUrl : undefined); advanceDay(); router.replace('/nutrition'); },
        },
        {
          text: 'Check In',
          onPress: () => { timer.pause(); finishWorkout(undefined, undefined, ytId ? youtubeUrl : undefined); advanceDay(); router.replace('/(tabs)/check-in'); },
        },
        {
          text: 'Ask Aimee',
          onPress: () => { timer.pause(); finishWorkout(undefined, undefined, ytId ? youtubeUrl : undefined); advanceDay(); router.replace('/(tabs)/peptalk'); },
        },
      ],
    );
  };

  const handleQuit = () => {
    Alert.alert('Quit Workout', 'Your progress for this session will be lost.', [
      { text: 'Keep Going', style: 'cancel' },
      { text: 'Quit', style: 'destructive', onPress: () => { timer.pause(); cancelWorkout(); router.back(); } },
    ]);
  };

  return (
    <PaywallGate feature="workout_programs">
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleQuit} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            Week {currentWeek} · Day {currentDayIdx + 1}
          </Text>
          <Text style={styles.headerTimer}>{timer.formatted}</Text>
        </View>
        <TouchableOpacity
          onPress={() => (timer.running ? timer.pause() : timer.start())}
          style={styles.backBtn}
        >
          <Ionicons
            name={timer.running ? 'pause' : 'play'}
            size={22}
            color={Colors.pepTeal}
          />
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${totalSets > 0 ? Math.round((completedSets.size / totalSets) * 100) : 0}%` },
          ]}
        />
      </View>
      <Text style={styles.progressText}>
        {completedSets.size} / {totalSets} sets completed
      </Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {day.exercises.map((exerciseSet, i) => (
          <View key={`${exerciseSet.exerciseId}-${i}`} style={styles.exWrap}>
            <ExerciseRow
              exerciseSet={exerciseSet}
              index={i}
              completedSets={completedSets}
              onToggleSet={handleToggleSet}
              setInputs={setInputs}
              onSetInput={handleSetInput}
              restTimer={restTimer}
            />
          </View>
        ))}

        {/* Reference video for program workouts */}
        <View style={[styles.exWrap, { marginTop: 4 }]}>
          <Text style={styles.freeSectionLabel}>Reference Video</Text>
          <YouTubeInputCard value={youtubeUrl} onChange={setYoutubeUrl} />
        </View>

        {/* Finish */}
        <View style={styles.finishSection}>
          <GradientButton
            label="Finish Workout"
            onPress={handleFinish}
            colors={[Colors.pepTeal, Colors.pepBlue]}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
    </PaywallGate>
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
    gap: 12,
    paddingHorizontal: Spacing.lg,
  },
  doneTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.darkText,
  },
  doneDesc: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    marginBottom: 12,
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
  headerCenter: { alignItems: 'center' },
  headerTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
  },
  headerTimer: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.pepTeal,
    fontVariant: ['tabular-nums'],
  },

  // Progress
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginHorizontal: Spacing.lg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.pepTeal,
    borderRadius: 2,
  },
  progressText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: Spacing.md,
  },

  scroll: { paddingBottom: 40 },
  exWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },

  // Exercise row
  exRow: {
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    padding: 14,
  },
  exHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  exNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exNum: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.pepTeal,
  },
  exInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exNameTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  exName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
    flexShrink: 1,
  },
  setTypeBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  setTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.pepBlue,
  },

  // Video section
  videoSection: {
    marginBottom: 10,
  },

  // Sets column
  setsColumn: {
    gap: 8,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    flex: 1,
  },

  // Weight/Rep inputs
  inputGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  inputWrapper: {
    width: 54,
  },
  setInput: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    color: Colors.darkText,
    fontSize: FontSizes.xs,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
  },
  setInputDone: {
    borderColor: 'rgba(16, 185, 129, 0.2)',
    color: Colors.success,
  },
  setCellDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  setText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },
  setTextDone: { color: Colors.success },
  repText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },
  repTextDone: { color: Colors.success },

  // Rest
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  restText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },

  // Rest timer countdown
  restTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.15)',
  },
  restTimerText: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.pepTeal,
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  restTimerSkip: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },

  // Finish
  finishSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },

  // YouTube card
  ytCard: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    height: 180,
    backgroundColor: '#000',
    marginTop: 10,
  },
  ytThumb: {
    width: '100%',
    height: '100%',
  },
  ytThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  ytOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  ytPlayBadge: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  ytPlayText: {
    color: '#fff',
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  ytRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  ytInputSection: {
    marginTop: 6,
  },
  ytAttachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ytAttachText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.darkText,
    fontWeight: '600',
  },
  ytInputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 12,
  },
  ytInput: {
    flex: 1,
    color: Colors.darkText,
    fontSize: FontSizes.sm,
    paddingVertical: 12,
  },
  ytError: {
    fontSize: FontSizes.xs,
    color: '#f87171',
    marginTop: 6,
  },

  // Free workout
  freeSection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  freeSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  freeSectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: 8,
  },
  freeNameInput: {
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14,
    height: 48,
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
  },
  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(20,184,166,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  addExText: {
    fontSize: FontSizes.sm,
    color: Colors.pepTeal,
    fontWeight: '600',
  },
  freeExHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  freeExNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.pepTeal,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  freeExNameInput: {
    flex: 1,
    color: Colors.darkText,
    fontSize: FontSizes.md,
    fontWeight: '600',
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBlueBorder,
    paddingBottom: 4,
  },
  freeExFields: {
    flexDirection: 'row',
    gap: 10,
  },
  freeExField: {
    flex: 1,
    alignItems: 'center',
  },
  freeExFieldLabel: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginBottom: 4,
  },
  freeExInput: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    width: '100%',
    textAlign: 'center',
    height: 38,
    fontSize: FontSizes.sm,
    color: Colors.darkText,
    fontWeight: '600',
  },
  freeNotesInput: {
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: FontSizes.sm,
    color: Colors.darkText,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
