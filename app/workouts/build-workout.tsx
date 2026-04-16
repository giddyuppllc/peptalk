/**
 * Build Workout — create a custom workout template.
 * Search exercises, add them with target sets/reps/weight, name and save.
 */

import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { EXERCISES, searchExercises, getExerciseById } from '../../src/data/exercises';
import {
  useWorkoutTemplateStore,
  type TemplateExercise,
} from '../../src/store/useWorkoutTemplateStore';
import type { Exercise } from '../../src/types/fitness';
import { tapLight, notifySuccess } from '../../src/utils/haptics';

const ACCENT = '#D98C86';

export default function BuildWorkoutScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();
  const addTemplate = useWorkoutTemplateStore((s) => s.addTemplate);

  const [workoutName, setWorkoutName] = useState('');
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return EXERCISES.slice(0, 20);
    return searchExercises(searchQuery).slice(0, 20);
  }, [searchQuery]);

  const addExercise = (exercise: Exercise) => {
    if (exercises.some((e) => e.exerciseId === exercise.id)) return;
    tapLight();
    setExercises((prev) => [
      ...prev,
      {
        exerciseId: exercise.id,
        targetSets: 3,
        targetReps: exercise.isTimeBased ? 30 : 10,
        targetWeightLbs: undefined,
        restSeconds: 60,
      },
    ]);
    setShowSearch(false);
    setSearchQuery('');
  };

  const removeExercise = (exerciseId: string) => {
    tapLight();
    setExercises((prev) => prev.filter((e) => e.exerciseId !== exerciseId));
  };

  const updateExercise = (exerciseId: string, field: keyof TemplateExercise, value: number) => {
    setExercises((prev) =>
      prev.map((e) => (e.exerciseId === exerciseId ? { ...e, [field]: value } : e))
    );
  };

  const handleSave = () => {
    const name = workoutName.trim();
    if (!name) {
      Alert.alert('Name Required', 'Give your workout a name.');
      return;
    }
    if (exercises.length === 0) {
      Alert.alert('No Exercises', 'Add at least one exercise.');
      return;
    }
    addTemplate(name, exercises);
    notifySuccess();
    Alert.alert('Saved!', `"${name}" has been saved to My Workouts.`, [
      { text: 'Done', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: t.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Build Workout</Text>
        <TouchableOpacity onPress={handleSave} activeOpacity={0.7}>
          <Text style={[styles.saveText, { color: ACCENT }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Workout name */}
          <TextInput
            style={[styles.nameInput, { color: t.text, borderBottomColor: t.cardBorder }]}
            value={workoutName}
            onChangeText={setWorkoutName}
            placeholder="Workout name (e.g., Push Day)"
            placeholderTextColor={t.textMuted}
          />

          {/* Exercise list */}
          {exercises.map((ex, idx) => {
            const exercise = getExerciseById(ex.exerciseId);
            if (!exercise) return null;
            return (
              <View key={ex.exerciseId} style={[styles.exerciseCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
                <View style={styles.exerciseHeader}>
                  <View style={styles.exerciseNum}>
                    <Text style={[styles.exerciseNumText, { color: ACCENT }]}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.exerciseName, { color: t.text }]}>{exercise.name}</Text>
                    <Text style={[styles.exerciseMuscle, { color: t.textMuted }]}>{exercise.primaryMuscle}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeExercise(ex.exerciseId)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="trash-outline" size={18} color={t.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Target inputs */}
                <View style={styles.targetRow}>
                  <View style={styles.targetItem}>
                    <Text style={[styles.targetLabel, { color: t.textSecondary }]}>Sets</Text>
                    <View style={styles.targetControl}>
                      <TouchableOpacity onPress={() => updateExercise(ex.exerciseId, 'targetSets', Math.max(1, ex.targetSets - 1))}>
                        <Ionicons name="remove-circle-outline" size={22} color={t.textSecondary} />
                      </TouchableOpacity>
                      <Text style={[styles.targetValue, { color: t.text }]}>{ex.targetSets}</Text>
                      <TouchableOpacity onPress={() => updateExercise(ex.exerciseId, 'targetSets', ex.targetSets + 1)}>
                        <Ionicons name="add-circle-outline" size={22} color={ACCENT} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.targetItem}>
                    <Text style={[styles.targetLabel, { color: t.textSecondary }]}>
                      {exercise.isTimeBased ? 'Sec' : 'Reps'}
                    </Text>
                    <View style={styles.targetControl}>
                      <TouchableOpacity onPress={() => updateExercise(ex.exerciseId, 'targetReps', Math.max(1, ex.targetReps - 1))}>
                        <Ionicons name="remove-circle-outline" size={22} color={t.textSecondary} />
                      </TouchableOpacity>
                      <Text style={[styles.targetValue, { color: t.text }]}>{ex.targetReps}</Text>
                      <TouchableOpacity onPress={() => updateExercise(ex.exerciseId, 'targetReps', ex.targetReps + 1)}>
                        <Ionicons name="add-circle-outline" size={22} color={ACCENT} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.targetItem}>
                    <Text style={[styles.targetLabel, { color: t.textSecondary }]}>Lbs</Text>
                    <TextInput
                      style={[styles.weightInput, { color: t.text, borderColor: t.cardBorder }]}
                      value={ex.targetWeightLbs ? String(ex.targetWeightLbs) : ''}
                      onChangeText={(v) => updateExercise(ex.exerciseId, 'targetWeightLbs', parseInt(v) || 0)}
                      keyboardType="numeric"
                      placeholder="—"
                      placeholderTextColor={t.textMuted}
                    />
                  </View>
                </View>
              </View>
            );
          })}

          {/* Add exercise button */}
          {!showSearch ? (
            <TouchableOpacity
              style={[styles.addBtn, { borderColor: `${ACCENT}55` }]}
              onPress={() => setShowSearch(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={18} color={ACCENT} />
              <Text style={[styles.addBtnText, { color: ACCENT }]}>Add Exercise</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.searchCard, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={t.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: t.text }]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search exercises..."
                  placeholderTextColor={t.textMuted}
                  autoFocus
                />
                <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); }}>
                  <Ionicons name="close" size={18} color={t.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.searchResults} nestedScrollEnabled>
                {searchResults.map((exercise) => {
                  const alreadyAdded = exercises.some((e) => e.exerciseId === exercise.id);
                  return (
                    <TouchableOpacity
                      key={exercise.id}
                      style={[styles.searchResultRow, { borderBottomColor: t.cardBorder }]}
                      onPress={() => !alreadyAdded && addExercise(exercise)}
                      activeOpacity={alreadyAdded ? 1 : 0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.searchResultName, { color: alreadyAdded ? t.textMuted : t.text }]}>
                          {exercise.name}
                        </Text>
                        <Text style={[styles.searchResultMeta, { color: t.textMuted }]}>
                          {exercise.primaryMuscle} · {exercise.equipment[0] || 'bodyweight'}
                        </Text>
                      </View>
                      {alreadyAdded ? (
                        <Ionicons name="checkmark-circle" size={20} color={ACCENT} />
                      ) : (
                        <Ionicons name="add-circle" size={20} color={ACCENT} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Summary */}
          {exercises.length > 0 && (
            <View style={styles.summary}>
              <Text style={[styles.summaryText, { color: t.textSecondary }]}>
                {exercises.length} exercise{exercises.length !== 1 ? 's' : ''} · {exercises.reduce((s, e) => s + e.targetSets, 0)} total sets
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontFamily: 'DMSans-Bold' },
  saveText: { fontSize: 15, fontFamily: 'DMSans-Bold' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },

  // Name
  nameInput: {
    fontSize: 22, fontFamily: 'Playfair-Bold', borderBottomWidth: 1,
    paddingBottom: 12, marginBottom: 20,
  },

  // Exercise card
  exerciseCard: {
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10,
  },
  exerciseHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  exerciseNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#D98C8620', alignItems: 'center', justifyContent: 'center',
  },
  exerciseNumText: { fontSize: 13, fontFamily: 'DMSans-Bold' },
  exerciseName: { fontSize: 14, fontFamily: 'DMSans-SemiBold' },
  exerciseMuscle: { fontSize: 11, fontFamily: 'DMSans-Regular', marginTop: 1 },

  // Target inputs
  targetRow: { flexDirection: 'row', gap: 12 },
  targetItem: { flex: 1, alignItems: 'center' },
  targetLabel: { fontSize: 10, fontFamily: 'DMSans-SemiBold', letterSpacing: 0.5, marginBottom: 6 },
  targetControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  targetValue: { fontSize: 18, fontFamily: 'DMSans-Bold', minWidth: 28, textAlign: 'center' },
  weightInput: {
    fontSize: 18, fontFamily: 'DMSans-Bold', textAlign: 'center',
    borderWidth: 1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, minWidth: 50,
  },

  // Add exercise
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderWidth: 1.5, borderRadius: 12, borderStyle: 'dashed',
    marginBottom: 16,
  },
  addBtnText: { fontSize: 14, fontFamily: 'DMSans-SemiBold' },

  // Search
  searchCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'DMSans-Regular', padding: 0 },
  searchResults: { maxHeight: 250 },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1,
  },
  searchResultName: { fontSize: 14, fontFamily: 'DMSans-SemiBold' },
  searchResultMeta: { fontSize: 11, fontFamily: 'DMSans-Regular', marginTop: 1 },

  // Summary
  summary: { alignItems: 'center', marginTop: 8 },
  summaryText: { fontSize: 13, fontFamily: 'DMSans-Medium' },
});
