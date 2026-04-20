import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { useJournalStore } from '../../src/store/useJournalStore';
import { PEPTIDES } from '../../src/data/peptides';
import { JournalCategory, CheckInRating } from '../../src/types';
import {
  Colors,
  Spacing,
  FontSizes,
  BorderRadius,
} from '../../src/constants/theme';

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: {
  value: JournalCategory;
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'protocol_notes', label: 'Protocol Notes', color: '#E89672', icon: 'document-text-outline' },
  { value: 'side_effects', label: 'Side Effects', color: '#ef4444', icon: 'warning-outline' },
  { value: 'mood', label: 'Mood', color: '#10b981', icon: 'happy-outline' },
  { value: 'progress', label: 'Progress', color: '#BADDCB', icon: 'trending-up-outline' },
  { value: 'research', label: 'Research', color: '#06b6d4', icon: 'flask-outline' },
  { value: 'questions', label: 'Questions', color: '#F4E9A7', icon: 'help-circle-outline' },
  { value: 'goals', label: 'Goals', color: '#ec4899', icon: 'flag-outline' },
  { value: 'general', label: 'General', color: '#6b7280', icon: 'create-outline' },
];

const MOOD_LABELS = ['', 'Awful', 'Bad', 'Okay', 'Good', 'Great'];
const MOOD_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'ellipse-outline',
  'sad-outline',
  'sad-outline',
  'remove-outline',
  'happy-outline',
  'happy-outline',
];
const MOOD_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#10b981', '#22c55e'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewJournalEntryScreen() {
  const router = useRouter();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const addEntry = useJournalStore((s) => s.addEntry);

  // Form state
  const [category, setCategory] = useState<JournalCategory>('general');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedPeptides, setSelectedPeptides] = useState<string[]>([]);
  const [mood, setMood] = useState<CheckInRating | undefined>(undefined);
  const [showPeptideList, setShowPeptideList] = useState(false);
  const [peptideSearch, setPeptideSearch] = useState('');

  const canSave = title.trim().length > 0 && content.trim().length > 0;

  // ------- Handlers -------

  const handleAddTag = () => {
    const raw = tagInput.trim();
    // Support comma-separated tags
    const newTags = raw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && !tags.includes(t));

    if (newTags.length > 0) {
      setTags((prev) => [...prev, ...newTags]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleTogglePeptide = (id: string) => {
    setSelectedPeptides((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    if (!canSave) return;

    addEntry({
      date: dateParam || undefined,
      category,
      title,
      content,
      tags,
      relatedPeptideIds: selectedPeptides.length > 0 ? selectedPeptides : undefined,
      mood,
    });

    Alert.alert('Entry Saved', 'Your journal entry has been logged.', [
      { text: 'Done', onPress: () => router.back() },
      { text: 'Check In', onPress: () => router.replace('/(tabs)/check-in' as any) },
      { text: 'Ask Aimee', onPress: () => router.replace('/(tabs)/peptalk' as any) },
    ]);
  };

  // Filtered peptide list
  const filteredPeptides = peptideSearch.trim()
    ? PEPTIDES.filter((p) =>
        p.name.toLowerCase().includes(peptideSearch.toLowerCase())
      )
    : PEPTIDES;

  // Active category color
  const activeCatColor =
    CATEGORY_OPTIONS.find((c) => c.value === category)?.color ?? '#6b7280';

  // ------- Renderers -------

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={Colors.darkText} />
        </Pressable>
        <Text style={styles.headerTitle}>New Entry</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Category Picker */}
        <Text style={styles.sectionLabel}>Category</Text>
        <View style={styles.categoryGrid}>
          {CATEGORY_OPTIONS.map((item) => {
            const isActive = item.value === category;
            return (
              <Pressable
                key={item.value}
                onPress={() => setCategory(item.value)}
                style={[
                  styles.categoryChip,
                  isActive && {
                    backgroundColor: item.color + '33',
                    borderColor: item.color,
                  },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={16}
                  color={isActive ? item.color : Colors.darkTextSecondary}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    isActive && { color: item.color },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Title */}
        <Text style={styles.sectionLabel}>Title</Text>
        <GlassCard style={styles.inputCard}>
          <TextInput
            style={styles.textInput}
            placeholder="Entry title..."
            placeholderTextColor={Colors.darkTextSecondary}
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
            maxLength={120}
          />
        </GlassCard>
        {title.length > 0 && (
          <Text style={styles.charCount}>{title.length}/120</Text>
        )}

        {/* Content */}
        <Text style={styles.sectionLabel}>Content</Text>
        <GlassCard style={styles.inputCard}>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Write your thoughts, observations, or notes..."
            placeholderTextColor={Colors.darkTextSecondary}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />
        </GlassCard>

        {/* Tags */}
        <Text style={styles.sectionLabel}>Tags</Text>
        <Text style={styles.sectionHint}>Comma-separated, press enter to add</Text>
        <GlassCard style={styles.inputCard}>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[styles.textInput, { flex: 1 }]}
              placeholder="e.g. energy, sleep, recovery"
              placeholderTextColor={Colors.darkTextSecondary}
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={handleAddTag}
              returnKeyType="done"
            />
            <Pressable onPress={handleAddTag} style={styles.addTagBtn}>
              <Ionicons name="add-circle" size={26} color={Colors.pepTeal} />
            </Pressable>
          </View>
          {tags.length > 0 && (
            <View style={styles.tagsWrap}>
              {tags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => handleRemoveTag(tag)}
                  style={styles.tagChip}
                >
                  <Text style={styles.tagChipText}>#{tag}</Text>
                  <Ionicons
                    name="close-circle"
                    size={14}
                    color={Colors.darkTextSecondary}
                    style={{ marginLeft: 4 }}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </GlassCard>

        {/* Related Peptides */}
        <Pressable
          onPress={() => setShowPeptideList((v) => !v)}
          style={styles.sectionToggle}
        >
          <View style={styles.sectionToggleLeft}>
            <Ionicons name="flask-outline" size={16} color={Colors.darkText} />
            <Text style={styles.sectionLabel}>Related Peptides</Text>
            <Text style={styles.optionalTag}>optional</Text>
          </View>
          <Ionicons
            name={showPeptideList ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.darkTextSecondary}
          />
        </Pressable>

        {showPeptideList && (
          <GlassCard style={styles.peptideListCard}>
            {/* Peptide search */}
            <View style={styles.peptideSearchRow}>
              <Ionicons name="search-outline" size={16} color={Colors.darkTextSecondary} />
              <TextInput
                style={styles.peptideSearchInput}
                placeholder="Search peptides..."
                placeholderTextColor={Colors.darkTextSecondary}
                value={peptideSearch}
                onChangeText={setPeptideSearch}
              />
            </View>
            <ScrollView style={styles.peptideScroll} nestedScrollEnabled>
              {filteredPeptides.map((p) => {
                const isSelected = selectedPeptides.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => handleTogglePeptide(p.id)}
                    style={[
                      styles.peptideRow,
                      isSelected && styles.peptideRowSelected,
                    ]}
                  >
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isSelected ? Colors.pepTeal : Colors.darkTextSecondary}
                    />
                    <Text style={[styles.peptideName, isSelected && { color: Colors.pepTeal }]}>
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </GlassCard>
        )}

        {/* Selected Peptides Summary */}
        {selectedPeptides.length > 0 && !showPeptideList && (
          <View style={styles.selectedSummary}>
            <Ionicons name="flask" size={14} color={Colors.pepTeal} />
            <Text style={styles.selectedSummaryText}>
              {selectedPeptides.length} peptide{selectedPeptides.length > 1 ? 's' : ''} selected
            </Text>
          </View>
        )}

        {/* Mood */}
        <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>
          Mood <Text style={styles.optionalTag}>optional</Text>
        </Text>
        <View style={styles.moodRow}>
          {([1, 2, 3, 4, 5] as CheckInRating[]).map((val) => {
            const isActive = mood === val;
            const moodColor = MOOD_COLORS[val];
            return (
              <Pressable
                key={val}
                onPress={() => setMood(isActive ? undefined : val)}
                style={[
                  styles.moodCircle,
                  isActive && {
                    backgroundColor: moodColor + '22',
                    borderColor: moodColor,
                  },
                ]}
              >
                <Ionicons
                  name={MOOD_ICONS[val]}
                  size={22}
                  color={isActive ? moodColor : Colors.darkTextSecondary}
                />
                <Text
                  style={[
                    styles.moodNumber,
                    isActive && { color: moodColor },
                  ]}
                >
                  {val}
                </Text>
                <Text
                  style={[
                    styles.moodLabel,
                    isActive && { color: moodColor },
                  ]}
                >
                  {MOOD_LABELS[val]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Save / Cancel */}
        <View style={styles.buttonRow}>
          <GradientButton
            label="Save Entry"
            onPress={handleSave}
            disabled={!canSave}
            colors={[activeCatColor, Colors.pepTeal]}
          />

          <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
            <Text style={styles.cancelBtnText}>Discard</Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.darkText,
  },
  cancelText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 40,
  },

  // Section labels
  sectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkText,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sectionHint: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginBottom: Spacing.sm,
    marginTop: -4,
  },
  optionalTag: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    fontWeight: '400',
    fontStyle: 'italic',
  },

  // Category chips — wrap grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    gap: 6,
  },
  categoryChipText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },

  // Inputs
  inputCard: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  textInput: {
    fontSize: FontSizes.md,
    color: Colors.darkText,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 140,
  },
  charCount: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    textAlign: 'right',
    marginTop: 4,
  },

  // Tags
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addTagBtn: {
    paddingLeft: Spacing.sm,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  tagChipText: {
    fontSize: FontSizes.xs,
    color: Colors.darkText,
  },

  // Peptides
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: Spacing.xs,
    marginTop: Spacing.md,
  },
  sectionToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  peptideListCard: {
    paddingVertical: Spacing.xs,
  },
  peptideSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    gap: Spacing.sm,
  },
  peptideSearchInput: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.darkText,
    paddingVertical: 6,
  },
  peptideScroll: {
    maxHeight: 220,
  },
  peptideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 10,
  },
  peptideRowSelected: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
  },
  peptideName: {
    fontSize: FontSizes.sm,
    color: Colors.darkText,
  },
  selectedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  selectedSummaryText: {
    fontSize: FontSizes.sm,
    color: Colors.pepTeal,
  },

  // Mood
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  moodCircle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    gap: 2,
  },
  moodNumber: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkTextSecondary,
  },
  moodLabel: {
    fontSize: 10,
    color: Colors.darkTextSecondary,
  },

  // Buttons
  buttonRow: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  cancelBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  cancelBtnText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },
});
