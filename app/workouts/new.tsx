/**
 * New custom workout — 3-step quick logger.
 *
 *   Step 1: name the workout
 *   Step 2: tap exercises from the 436-exercise library
 *           (search bar + muscle-group category chips)
 *   Step 3: for each picked exercise, set sets × reps. Two numbers, that's it.
 *
 * Anything advanced (RPE, tempo, %1RM, rest interval) is hidden behind the
 * `showAdvancedFitness` profile flag. Default off — Jamie's feedback round 1
 * was that the previous builder buried the user under prescription fields.
 *
 * Save → drops a WorkoutTemplate into useWorkoutTemplateStore, which the
 * dashboard at /workouts surfaces as "My saved".
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, BorderRadius } from '../../src/constants/theme';
import { EXERCISES, getExerciseById, searchExercises } from '../../src/data/exercises';
import {
  useWorkoutTemplateStore,
  type TemplateExercise,
} from '../../src/store/useWorkoutTemplateStore';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import type { Exercise, MuscleGroup } from '../../src/types/fitness';
import { tapLight, tapMedium, notifySuccess, selectionTick } from '../../src/utils/haptics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Step = 'name' | 'pick' | 'reps';

/** Category chips — derived from the MuscleGroup taxonomy. "All" is the
 *  default; everything else filters EXERCISES by primaryMuscle or
 *  secondaryMuscles membership. */
const CATEGORIES: { key: MuscleGroup | 'all'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All', icon: 'apps' },
  { key: 'chest', label: 'Chest', icon: 'body' },
  { key: 'back', label: 'Back', icon: 'body' },
  { key: 'shoulders', label: 'Shoulders', icon: 'body' },
  { key: 'biceps', label: 'Biceps', icon: 'fitness' },
  { key: 'triceps', label: 'Triceps', icon: 'fitness' },
  { key: 'core', label: 'Core', icon: 'ellipse' },
  { key: 'glutes', label: 'Glutes', icon: 'body' },
  { key: 'quads', label: 'Quads', icon: 'walk' },
  { key: 'hamstrings', label: 'Hamstrings', icon: 'walk' },
  { key: 'calves', label: 'Calves', icon: 'walk' },
  { key: 'cardio', label: 'Cardio', icon: 'heart' },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function NewWorkoutScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();
  const addTemplate = useWorkoutTemplateStore((st) => st.addTemplate);
  const showAdvanced = useOnboardingStore((st) => st.showAdvancedFitness);

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<TemplateExercise[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<MuscleGroup | 'all'>('all');

  // -------------------------------------------------------------------------
  // Filtered exercise list
  // -------------------------------------------------------------------------
  const filtered = useMemo<Exercise[]>(() => {
    let pool: Exercise[] = search.trim()
      ? searchExercises(search.trim())
      : EXERCISES;
    if (category !== 'all') {
      const cat = category as MuscleGroup;
      pool = pool.filter(
        (e) => e.primaryMuscle === cat || e.secondaryMuscles.includes(cat),
      );
    }
    // Stable cap so the FlatList stays snappy even with the full library;
    // search narrows it for the user, so 80 is plenty for browsing.
    return pool.slice(0, 80);
  }, [search, category]);

  // -------------------------------------------------------------------------
  // Step transitions
  // -------------------------------------------------------------------------
  const goNext = () => {
    if (step === 'name') {
      if (!name.trim()) {
        Alert.alert('Name your workout', 'Give it a name so you can find it later.');
        return;
      }
      tapMedium();
      setStep('pick');
    } else if (step === 'pick') {
      if (picked.length === 0) {
        Alert.alert('Pick exercises', 'Tap at least one exercise from the list.');
        return;
      }
      tapMedium();
      setStep('reps');
    } else {
      handleSave();
    }
  };

  const goBack = () => {
    if (step === 'reps') {
      tapLight();
      setStep('pick');
    } else if (step === 'pick') {
      tapLight();
      setStep('name');
    } else {
      router.back();
    }
  };

  // -------------------------------------------------------------------------
  // Picking / un-picking
  // -------------------------------------------------------------------------
  const togglePick = useCallback((exercise: Exercise) => {
    setPicked((prev) => {
      const exists = prev.find((p) => p.exerciseId === exercise.id);
      if (exists) {
        tapLight();
        return prev.filter((p) => p.exerciseId !== exercise.id);
      }
      selectionTick();
      return [
        ...prev,
        {
          exerciseId: exercise.id,
          targetSets: 3,
          targetReps: exercise.isTimeBased ? 30 : 10,
        },
      ];
    });
  }, []);

  const updatePicked = (exerciseId: string, field: 'targetSets' | 'targetReps', value: number) => {
    setPicked((prev) =>
      prev.map((p) => (p.exerciseId === exerciseId ? { ...p, [field]: Math.max(1, value) } : p)),
    );
  };

  const removePicked = (exerciseId: string) => {
    tapLight();
    setPicked((prev) => prev.filter((p) => p.exerciseId !== exerciseId));
  };

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  const handleSave = () => {
    addTemplate(name.trim(), picked);
    notifySuccess();
    Alert.alert(
      'Saved',
      `"${name.trim()}" is in your saved workouts.`,
      [{ text: 'Done', onPress: () => router.replace('/workouts' as never) }],
    );
  };

  // -------------------------------------------------------------------------
  // Header — step indicator + back / next
  // -------------------------------------------------------------------------
  const stepNum = step === 'name' ? 1 : step === 'pick' ? 2 : 3;
  const stepLabel =
    step === 'name' ? 'Name it' : step === 'pick' ? 'Pick exercises' : 'Sets & reps';
  const nextLabel = step === 'reps' ? 'Save' : 'Next';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={goBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name={step === 'name' ? 'close' : 'chevron-back'} size={24} color={t.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={[s.headerStep, { color: accent.deep }]}>STEP {stepNum} OF 3</Text>
          <Text style={[s.headerTitle, { color: t.text }]}>{stepLabel}</Text>
        </View>
        <TouchableOpacity onPress={goNext} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[s.headerAction, { color: accent.deep }]}>{nextLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={[s.progressTrack, { backgroundColor: t.cardBorder }]}>
        <View
          style={[
            s.progressFill,
            { backgroundColor: accent.deep, width: `${(stepNum / 3) * 100}%` },
          ]}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {step === 'name' && (
          <NameStep
            name={name}
            onChange={setName}
            onSubmit={goNext}
            accent={accent.deep}
            t={t}
          />
        )}

        {step === 'pick' && (
          <PickStep
            picked={picked}
            filtered={filtered}
            search={search}
            onSearch={setSearch}
            category={category}
            onCategory={setCategory}
            onToggle={togglePick}
            accent={accent.deep}
            t={t}
          />
        )}

        {step === 'reps' && (
          <RepsStep
            picked={picked}
            onUpdate={updatePicked}
            onRemove={removePicked}
            showAdvanced={showAdvanced}
            accent={accent.deep}
            t={t}
          />
        )}
      </KeyboardAvoidingView>

      {/* Bottom CTA — mirrors the header Next so users don't have to
          tab-hunt. Hidden on the pick step because the FlatList already
          extends to the bottom and the chip row makes a CTA crowd. */}
      {step !== 'pick' && (
        <View style={[s.bottomBar, { borderTopColor: t.cardBorder, backgroundColor: t.bg }]}>
          <TouchableOpacity
            onPress={goNext}
            activeOpacity={0.88}
            style={s.bottomCta}
          >
            <LinearGradient
              colors={['#E89672', '#D98C86']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.bottomCtaGrad}
            >
              <Text style={s.bottomCtaText}>{nextLabel}</Text>
              <Ionicons
                name={step === 'reps' ? 'checkmark' : 'arrow-forward'}
                size={18}
                color="#fff"
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Name
// ---------------------------------------------------------------------------

function NameStep({
  name,
  onChange,
  onSubmit,
  accent,
  t,
}: {
  name: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  accent: string;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <ScrollView
      contentContainerStyle={s.stepScroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[s.stepLead, { color: t.text }]}>What do you want to call it?</Text>
      <Text style={[s.stepHint, { color: t.textSecondary }]}>
        Push day, leg day, "the one I hate" — whatever helps you find it later.
      </Text>
      <TextInput
        value={name}
        onChangeText={onChange}
        placeholder="e.g., Push day"
        placeholderTextColor={t.textMuted}
        style={[
          s.nameInput,
          { color: t.text, borderColor: name ? accent : t.cardBorder, backgroundColor: t.surface },
        ]}
        autoFocus
        returnKeyType="next"
        onSubmitEditing={onSubmit}
      />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Pick exercises
// ---------------------------------------------------------------------------

function PickStep({
  picked,
  filtered,
  search,
  onSearch,
  category,
  onCategory,
  onToggle,
  accent,
  t,
}: {
  picked: TemplateExercise[];
  filtered: Exercise[];
  search: string;
  onSearch: (v: string) => void;
  category: MuscleGroup | 'all';
  onCategory: (v: MuscleGroup | 'all') => void;
  onToggle: (exercise: Exercise) => void;
  accent: string;
  t: ReturnType<typeof useTheme>;
}) {
  const pickedIds = useMemo(() => new Set(picked.map((p) => p.exerciseId)), [picked]);

  return (
    <View style={{ flex: 1 }}>
      {/* Search */}
      <View style={[s.searchRow, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
        <Ionicons name="search" size={18} color={t.textMuted} />
        <TextInput
          style={[s.searchInput, { color: t.text }]}
          value={search}
          onChangeText={onSearch}
          placeholder="Search exercises"
          placeholderTextColor={t.textMuted}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => onSearch('')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={t.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {CATEGORIES.map((cat) => {
          const active = category === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => {
                selectionTick();
                onCategory(cat.key as MuscleGroup | 'all');
              }}
              activeOpacity={0.75}
              style={[
                s.chip,
                {
                  backgroundColor: active ? accent : t.surface,
                  borderColor: active ? accent : t.cardBorder,
                },
              ]}
            >
              <Ionicons name={cat.icon} size={13} color={active ? '#fff' : t.textSecondary} />
              <Text style={[s.chipText, { color: active ? '#fff' : t.text }]}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Picked summary */}
      {picked.length > 0 && (
        <View style={[s.pickedBar, { backgroundColor: `${accent}12`, borderColor: `${accent}30` }]}>
          <Ionicons name="checkmark-circle" size={16} color={accent} />
          <Text style={[s.pickedText, { color: accent }]}>{picked.length} picked</Text>
        </View>
      )}

      {/* Results */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.resultsList}
        ListEmptyComponent={
          <View style={s.emptyResults}>
            <Ionicons name="search" size={32} color={t.textMuted} />
            <Text style={[s.emptyResultsText, { color: t.textSecondary }]}>
              No exercises match. Try a different word or category.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isPicked = pickedIds.has(item.id);
          return (
            <TouchableOpacity
              onPress={() => onToggle(item)}
              activeOpacity={0.75}
              style={[
                s.resultRow,
                {
                  backgroundColor: isPicked ? `${accent}10` : t.surface,
                  borderColor: isPicked ? accent : t.cardBorder,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.resultName, { color: t.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[s.resultMeta, { color: t.textSecondary }]} numberOfLines={1}>
                  {item.primaryMuscle} · {item.equipment[0] || 'bodyweight'}
                </Text>
              </View>
              <Ionicons
                name={isPicked ? 'checkmark-circle' : 'add-circle-outline'}
                size={26}
                color={isPicked ? accent : t.textMuted}
              />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Sets × reps
// ---------------------------------------------------------------------------

function RepsStep({
  picked,
  onUpdate,
  onRemove,
  showAdvanced,
  accent,
  t,
}: {
  picked: TemplateExercise[];
  onUpdate: (id: string, field: 'targetSets' | 'targetReps', value: number) => void;
  onRemove: (id: string) => void;
  showAdvanced: boolean;
  accent: string;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <ScrollView
      contentContainerStyle={s.stepScroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[s.stepLead, { color: t.text }]}>How many sets and reps?</Text>
      <Text style={[s.stepHint, { color: t.textSecondary }]}>
        Two numbers per exercise. Adjust on the fly in your next session.
      </Text>

      {!showAdvanced && (
        <View style={[s.advancedNote, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
          <Ionicons name="information-circle-outline" size={16} color={t.textSecondary} />
          <Text style={[s.advancedNoteText, { color: t.textSecondary }]}>
            Want RPE, tempo, or rest intervals? Turn on Advanced fitness in Profile → Settings.
          </Text>
        </View>
      )}

      {picked.map((ex, idx) => {
        const exercise = getExerciseById(ex.exerciseId);
        if (!exercise) return null;
        const repsLabel = exercise.isTimeBased ? 'Seconds' : 'Reps';
        return (
          <View
            key={ex.exerciseId}
            style={[s.repsCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
          >
            <View style={s.repsHeader}>
              <View style={[s.repsNum, { backgroundColor: `${accent}18` }]}>
                <Text style={[s.repsNumText, { color: accent }]}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.repsName, { color: t.text }]} numberOfLines={1}>
                  {exercise.name}
                </Text>
                <Text style={[s.repsMuscle, { color: t.textMuted }]}>{exercise.primaryMuscle}</Text>
              </View>
              <TouchableOpacity
                onPress={() => onRemove(ex.exerciseId)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={`Remove ${exercise.name}`}
              >
                <Ionicons name="trash-outline" size={18} color={t.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={s.repsRow}>
              <Stepper
                label="Sets"
                value={ex.targetSets}
                onChange={(v) => onUpdate(ex.exerciseId, 'targetSets', v)}
                accent={accent}
                t={t}
              />
              <Stepper
                label={repsLabel}
                value={ex.targetReps}
                onChange={(v) => onUpdate(ex.exerciseId, 'targetReps', v)}
                accent={accent}
                t={t}
                stepBy={exercise.isTimeBased ? 5 : 1}
              />
            </View>
          </View>
        );
      })}

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Stepper — shared - / value / + control
// ---------------------------------------------------------------------------

function Stepper({
  label,
  value,
  onChange,
  accent,
  t,
  stepBy = 1,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  accent: string;
  t: ReturnType<typeof useTheme>;
  stepBy?: number;
}) {
  return (
    <View style={s.stepper}>
      <Text style={[s.stepperLabel, { color: t.textSecondary }]}>{label}</Text>
      <View style={s.stepperRow}>
        <TouchableOpacity
          onPress={() => {
            tapLight();
            onChange(Math.max(1, value - stepBy));
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Ionicons name="remove-circle-outline" size={28} color={t.textSecondary} />
        </TouchableOpacity>
        <Text style={[s.stepperValue, { color: t.text }]}>{value}</Text>
        <TouchableOpacity
          onPress={() => {
            tapLight();
            onChange(value + stepBy);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Ionicons name="add-circle" size={28} color={accent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
  },
  headerStep: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'DMSans-Bold',
    marginTop: 1,
  },
  headerAction: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
  },

  // Progress
  progressTrack: {
    height: 3,
    marginHorizontal: Spacing.lg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Step scroll wrapper
  stepScroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 24,
  },
  stepLead: {
    fontSize: 24,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.4,
  },
  stepHint: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 19,
  },

  // Step 1 — name input
  nameInput: {
    fontSize: 22,
    fontFamily: 'Playfair-Bold',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
  },

  // Step 2 — search & chips
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    padding: 0,
  },
  chipRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
  },
  pickedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: Spacing.lg,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  pickedText: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
  },
  resultsList: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  resultName: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
    textTransform: 'capitalize',
  },
  resultMeta: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  emptyResults: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 40,
    paddingHorizontal: 24,
  },
  emptyResultsText: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
  },

  // Step 3 — reps cards
  advancedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: 16,
  },
  advancedNoteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    lineHeight: 17,
  },
  repsCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  repsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  repsNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repsNumText: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
  },
  repsName: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
    textTransform: 'capitalize',
  },
  repsMuscle: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 1,
    textTransform: 'capitalize',
  },
  repsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  stepper: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  stepperLabel: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepperValue: {
    fontSize: 22,
    fontFamily: 'DMSans-Bold',
    minWidth: 36,
    textAlign: 'center',
  },

  // Bottom CTA
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
  },
  bottomCta: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  bottomCtaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  bottomCtaText: {
    color: '#fff',
    fontFamily: 'DMSans-Bold',
    fontSize: 15,
  },
});
