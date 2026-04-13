/**
 * Exercise Library — 289 exercises curated by Jamie Esposito.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { EXERCISES, searchExercises } from '../../src/data/exercises';
import { ExerciseVideo } from '../../src/components/ExerciseVideo';
import type { Exercise, MuscleGroup, Equipment } from '../../src/types/fitness';

// ---------------------------------------------------------------------------
// Muscle group filter chips
// ---------------------------------------------------------------------------

const MUSCLE_FILTERS: { key: MuscleGroup | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'core', label: 'Core' },
  { key: 'glutes', label: 'Glutes' },
  { key: 'quads', label: 'Quads' },
  { key: 'hamstrings', label: 'Hamstrings' },
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'triceps', label: 'Triceps' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'full_body', label: 'Full Body' },
];

const EQUIPMENT_FILTERS: { key: Equipment | 'all'; label: string }[] = [
  { key: 'all', label: 'All Equipment' },
  { key: 'none', label: 'Bodyweight' },
  { key: 'dumbbell', label: 'Dumbbell' },
  { key: 'barbell', label: 'Barbell' },
  { key: 'kettlebell', label: 'Kettlebell' },
  { key: 'cable', label: 'Cable' },
  { key: 'machine', label: 'Machine' },
  { key: 'band', label: 'Band' },
  { key: 'stability_ball', label: 'Stability Ball' },
  { key: 'medicine_ball', label: 'Medicine Ball' },
  { key: 'bench', label: 'Bench' },
  { key: 'smith_machine', label: 'Smith Machine' },
  { key: 'pull_up_bar', label: 'Pull-up Bar' },
  { key: 'plate', label: 'Plate' },
  { key: 'towel', label: 'Towel' },
  { key: 'block', label: 'Block' },
  { key: 'jump_rope', label: 'Jump Rope' },
];

const EQUIPMENT_ICONS: Record<string, string> = {
  none: 'body-outline',
  dumbbell: 'barbell-outline',
  barbell: 'barbell-outline',
  kettlebell: 'fitness-outline',
  cable: 'git-branch-outline',
  machine: 'cog-outline',
  band: 'radio-outline',
  stability_ball: 'ellipse-outline',
  medicine_ball: 'football-outline',
  bench: 'bed-outline',
  smith_machine: 'grid-outline',
  pull_up_bar: 'arrow-up-outline',
  plate: 'disc-outline',
  towel: 'water-outline',
  block: 'cube-outline',
  jump_rope: 'pulse-outline',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasVideo(exercise: Exercise): boolean {
  return !!exercise.videoUrl;
}

function formatEquipment(equipment: Equipment): string {
  return equipment.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Exercise Row
// ---------------------------------------------------------------------------

function ExerciseItem({
  exercise,
  onPress,
}: {
  exercise: Exercise;
  onPress: () => void;
}) {
  const equipStr = exercise.equipment
    .filter((e) => e !== 'none')
    .join(', ')
    .replace(/_/g, ' ');

  return (
    <TouchableOpacity style={styles.exRow} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.exIcon}>
        <Ionicons
          name={
            (EQUIPMENT_ICONS[exercise.equipment[0]] ??
              'barbell-outline') as any
          }
          size={18}
          color={Colors.pepTeal}
        />
      </View>
      <View style={styles.exInfo}>
        <View style={styles.exNameRow}>
          <Text style={styles.exName} numberOfLines={1}>
            {exercise.name}
          </Text>
          {hasVideo(exercise) && (
            <View style={styles.videoBadge}>
              <Ionicons name="videocam" size={11} color={Colors.pepTeal} />
            </View>
          )}
        </View>
        <View style={styles.exMeta}>
          <View style={styles.exPill}>
            <Text style={styles.exPillText}>
              {exercise.primaryMuscle.replace(/_/g, ' ')}
            </Text>
          </View>
          {equipStr ? (
            <View style={[styles.exPill, styles.exPillEquip]}>
              <Text style={styles.exPillEquipText}>{equipStr}</Text>
            </View>
          ) : null}
          {exercise.isTimeBased && (
            <View style={[styles.exPill, styles.exPillTime]}>
              <Ionicons name="timer-outline" size={10} color={Colors.pepBlue} />
              <Text style={styles.exPillTimeText}>Timed</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.darkTextSecondary} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Detail Modal
// ---------------------------------------------------------------------------

function ExerciseDetailModal({
  exercise,
  visible,
  onClose,
}: {
  exercise: Exercise | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!exercise) return null;

  const equipStr = exercise.equipment
    .filter((e) => e !== 'none')
    .map(formatEquipment)
    .join(', ');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Close button */}
          <TouchableOpacity style={styles.modalClose} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.darkText} />
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScroll}
          >
            {/* Title */}
            <Text style={styles.modalTitle}>{exercise.name}</Text>

            {/* Video */}
            <View style={styles.videoContainer}>
              <ExerciseVideo exerciseId={exercise.id} />
            </View>

            {/* Badges */}
            <View style={styles.modalBadges}>
              {/* Muscle group */}
              <View style={styles.modalBadge}>
                <Ionicons name="body-outline" size={14} color={Colors.pepTeal} />
                <Text style={styles.modalBadgeText}>
                  {exercise.primaryMuscle.replace(/_/g, ' ')}
                </Text>
              </View>

              {/* Equipment */}
              {equipStr ? (
                <View style={[styles.modalBadge, styles.modalBadgeEquip]}>
                  <Ionicons
                    name={
                      (EQUIPMENT_ICONS[exercise.equipment[0]] ??
                        'barbell-outline') as any
                    }
                    size={14}
                    color={Colors.pepBlue}
                  />
                  <Text style={styles.modalBadgeEquipText}>{equipStr}</Text>
                </View>
              ) : (
                <View style={[styles.modalBadge, styles.modalBadgeEquip]}>
                  <Ionicons name="body-outline" size={14} color={Colors.pepBlue} />
                  <Text style={styles.modalBadgeEquipText}>Bodyweight</Text>
                </View>
              )}

              {/* Difficulty */}
              <View style={[styles.modalBadge, styles.modalBadgeDifficulty]}>
                <Ionicons name="speedometer-outline" size={14} color={Colors.success} />
                <Text style={styles.modalBadgeDifficultyText}>
                  {exercise.difficulty}
                </Text>
              </View>
            </View>

            {/* Instructions */}
            {exercise.instructions ? (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Instructions</Text>
                <Text style={styles.modalDescription}>{exercise.instructions}</Text>
              </View>
            ) : null}

            {/* Priority & Location */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Details</Text>
              <Text style={styles.modalDescription}>
                Priority: {exercise.priority} · Location: {exercise.location} · For: {exercise.gender}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function ExerciseLibraryScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | 'all'>(
    'all',
  );
  const [equipmentFilter, setEquipmentFilter] = useState<Equipment | 'all'>(
    'all',
  );
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null,
  );
  const [modalVisible, setModalVisible] = useState(false);

  const filtered = useMemo(() => {
    let results = query ? searchExercises(query) : EXERCISES;
    if (muscleFilter !== 'all') {
      results = results.filter((e) => e.primaryMuscle === muscleFilter);
    }
    if (equipmentFilter !== 'all') {
      results = results.filter((e) => e.equipment.includes(equipmentFilter));
    }
    return results;
  }, [query, muscleFilter, equipmentFilter]);

  const openDetail = useCallback((exercise: Exercise) => {
    setSelectedExercise(exercise);
    setModalVisible(true);
  }, []);

  const closeDetail = useCallback(() => {
    setModalVisible(false);
    setSelectedExercise(null);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Exercise Library</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.darkTextSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises..."
            placeholderTextColor={Colors.darkTextSecondary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons
                name="close-circle"
                size={18}
                color={Colors.darkTextSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Muscle filter */}
      <FlatList
        horizontal
        data={MUSCLE_FILTERS}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.filterChip,
              muscleFilter === item.key && styles.filterChipActive,
            ]}
            onPress={() => setMuscleFilter(item.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                muscleFilter === item.key && styles.filterChipTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Equipment filter */}
      <FlatList
        horizontal
        data={EQUIPMENT_FILTERS}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.filterChip,
              styles.filterChipEquipment,
              equipmentFilter === item.key && styles.filterChipEquipmentActive,
            ]}
            onPress={() => setEquipmentFilter(item.key)}
          >
            {item.key !== 'all' && (
              <Ionicons
                name={(EQUIPMENT_ICONS[item.key] ?? 'barbell-outline') as any}
                size={12}
                color={
                  equipmentFilter === item.key
                    ? '#fff'
                    : Colors.darkTextSecondary
                }
                style={{ marginRight: 4 }}
              />
            )}
            <Text
              style={[
                styles.filterChipText,
                equipmentFilter === item.key && styles.filterChipTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Count */}
      <Text style={styles.countText}>
        {filtered.length} exercise{filtered.length !== 1 ? 's' : ''}
      </Text>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ExerciseItem exercise={item} onPress={() => openDetail(item)} />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="search-outline"
              size={36}
              color={Colors.darkTextSecondary}
            />
            <Text style={styles.emptyText}>No exercises found</Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <ExerciseDetailModal
        exercise={selectedExercise}
        visible={modalVisible}
        onClose={closeDetail}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
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
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#2D2D2D',
  },

  // Search
  searchWrap: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.darkText,
  },

  // Filters
  filterRow: {
    paddingHorizontal: Spacing.lg,
    gap: 8,
    marginBottom: Spacing.sm,
  },
  filterChip: {
    backgroundColor: Colors.glassBlue,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
  },
  filterChipActive: {
    backgroundColor: Colors.pepTeal,
    borderColor: Colors.pepTeal,
  },
  filterChipEquipment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.glassBlue,
    borderColor: Colors.glassBlueBorder,
  },
  filterChipEquipmentActive: {
    backgroundColor: Colors.pepBlue,
    borderColor: Colors.pepBlue,
  },
  filterChipText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // Count
  countText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // List
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: 2,
  },

  // Exercise row
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  exIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exInfo: { flex: 1 },
  exNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
    flexShrink: 1,
  },
  videoBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  exPill: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  exPillText: {
    fontSize: 10,
    color: Colors.pepTeal,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  exPillEquip: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  exPillEquipText: {
    fontSize: 10,
    color: Colors.pepBlue,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  exPillTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  exPillTimeText: {
    fontSize: 10,
    color: Colors.pepBlue,
    fontWeight: '500',
  },

  // Empty
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.darkBg,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    maxHeight: '90%',
    minHeight: '50%',
  },
  modalClose: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.glassBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.darkText,
    marginBottom: Spacing.md,
    paddingRight: 44,
  },
  videoContainer: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  modalBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  modalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modalBadgeText: {
    fontSize: FontSizes.sm,
    color: Colors.pepTeal,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  modalBadgeEquip: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  modalBadgeEquipText: {
    fontSize: FontSizes.sm,
    color: Colors.pepBlue,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  modalBadgeDifficulty: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  modalBadgeDifficultyText: {
    fontSize: FontSizes.sm,
    color: Colors.success,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  modalSection: {
    marginBottom: Spacing.lg,
  },
  modalSectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: Spacing.sm,
  },
  modalDescription: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 22,
  },
  instructionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  instructionNum: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.pepTeal,
    width: 20,
    textAlign: 'center',
  },
  instructionText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 20,
  },
});
