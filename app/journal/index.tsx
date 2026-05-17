import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useJournalStore } from '../../src/store/useJournalStore';
import { JournalCategory, JournalEntry } from '../../src/types';
import {
  Colors,
  Spacing,
  FontSizes,
  BorderRadius,
} from '../../src/constants/theme';

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<JournalCategory, string> = {
  protocol_notes: '#E89672',
  side_effects: '#ef4444',
  mood: '#10b981',
  progress: '#A4D9D1',
  research: '#06b6d4',
  questions: '#F4ECC2',
  goals: '#ec4899',
  general: '#6b7280',
};

const CATEGORY_LABELS: Record<JournalCategory, string> = {
  protocol_notes: 'Protocol Notes',
  side_effects: 'Side Effects',
  mood: 'Mood',
  progress: 'Progress',
  research: 'Research',
  questions: 'Questions',
  goals: 'Goals',
  general: 'General',
};

const CATEGORY_ICONS: Record<JournalCategory, keyof typeof Ionicons.glyphMap> = {
  protocol_notes: 'document-text-outline',
  side_effects: 'warning-outline',
  mood: 'happy-outline',
  progress: 'trending-up-outline',
  research: 'flask-outline',
  questions: 'help-circle-outline',
  goals: 'flag-outline',
  general: 'create-outline',
};

type CategoryFilter = 'all' | JournalCategory;

const CATEGORY_FILTER_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'protocol_notes', label: 'Protocol Notes' },
  { value: 'side_effects', label: 'Side Effects' },
  { value: 'mood', label: 'Mood' },
  { value: 'progress', label: 'Progress' },
  { value: 'research', label: 'Research' },
  { value: 'questions', label: 'Questions' },
  { value: 'goals', label: 'Goals' },
  { value: 'general', label: 'General' },
];

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

type DateRange = 'all' | 'today' | 'week' | 'month';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

const toDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getDateRangeBounds = (range: DateRange): { start: string; end: string } | null => {
  if (range === 'all') return null;
  const now = new Date();
  const end = toDateKey(now);

  if (range === 'today') {
    return { start: end, end };
  }

  if (range === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - weekAgo.getDay()); // start of week (Sunday)
    return { start: toDateKey(weekAgo), end };
  }

  // month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toDateKey(monthStart), end };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JournalFeedScreen() {
  const router = useRouter();
  const entries = useJournalStore((s) => s.entries);

  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [activeDateRange, setActiveDateRange] = useState<DateRange>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Reverse-chronological, filtered list
  const filtered = useMemo(() => {
    let result = [...entries].sort((a, b) => {
      const da = `${a.date}T${a.time}`;
      const db = `${b.date}T${b.time}`;
      return db.localeCompare(da);
    });

    // Category filter
    if (activeCategory !== 'all') {
      result = result.filter((e) => e.category === activeCategory);
    }

    // Date range filter
    const bounds = getDateRangeBounds(activeDateRange);
    if (bounds) {
      result = result.filter((e) => e.date >= bounds.start && e.date <= bounds.end);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [entries, activeCategory, activeDateRange, searchQuery]);

  // Count per category for badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
    return counts;
  }, [entries]);

  // ------- Renderers -------

  const renderCategoryChip = useCallback(
    ({ item }: { item: { value: CategoryFilter; label: string } }) => {
      const isActive = item.value === activeCategory;
      const color =
        item.value === 'all' ? Colors.pepTeal : CATEGORY_COLORS[item.value as JournalCategory];
      const count = categoryCounts[item.value] || 0;

      return (
        <Pressable
          onPress={() => setActiveCategory(item.value)}
          style={[
            styles.filterChip,
            isActive && { backgroundColor: color + '33', borderColor: color },
          ]}
        >
          {item.value !== 'all' && (
            <Ionicons
              name={CATEGORY_ICONS[item.value as JournalCategory]}
              size={14}
              color={isActive ? color : Colors.darkTextSecondary}
            />
          )}
          <Text
            style={[
              styles.filterChipText,
              isActive && { color },
            ]}
          >
            {item.label}
          </Text>
          {count > 0 && (
            <View style={[styles.countBadge, isActive && { backgroundColor: color + '44' }]}>
              <Text style={[styles.countBadgeText, isActive && { color }]}>{count}</Text>
            </View>
          )}
        </Pressable>
      );
    },
    [activeCategory, categoryCounts]
  );

  const renderDateRangeChip = useCallback(
    ({ item }: { item: { value: DateRange; label: string } }) => {
      const isActive = item.value === activeDateRange;
      return (
        <Pressable
          onPress={() => setActiveDateRange(item.value)}
          style={[
            styles.dateChip,
            isActive && styles.dateChipActive,
          ]}
        >
          <Text
            style={[
              styles.dateChipText,
              isActive && styles.dateChipTextActive,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      );
    },
    [activeDateRange]
  );

  const deleteEntry = useJournalStore((s) => s.deleteEntry);

  const handleEntryLongPress = useCallback(
    (entry: JournalEntry) => {
      Alert.alert(
        entry.title || 'Journal entry',
        'What would you like to do with this entry?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Edit',
            onPress: () => router.push(`/journal/new?id=${entry.id}` as any),
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () =>
              Alert.alert(
                'Delete entry?',
                'This will permanently remove this journal entry. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteEntry(entry.id),
                  },
                ],
              ),
          },
        ],
      );
    },
    [deleteEntry, router],
  );

  const renderEntry = useCallback(
    ({ item }: { item: JournalEntry }) => {
      const color = CATEGORY_COLORS[item.category] ?? '#6b7280';
      const label = CATEGORY_LABELS[item.category] ?? item.category;
      const icon = CATEGORY_ICONS[item.category] ?? 'create-outline';
      const preview =
        item.content.length > 120
          ? item.content.slice(0, 120) + '...'
          : item.content;

      return (
        <Pressable
          onPress={() => router.push(`/journal/new?id=${item.id}` as any)}
          onLongPress={() => handleEntryLongPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. Tap to edit, long-press for delete.`}
        >
          <GlassCard style={styles.entryCard}>
            {/* Date + Category */}
            <View style={styles.entryHeader}>
              <Text style={styles.entryDate}>
                {item.date}{'  '}{item.time}
              </Text>
              <View style={[styles.categoryBadge, { backgroundColor: color + '22' }]}>
                <Ionicons name={icon} size={12} color={color} style={{ marginRight: 4 }} />
                <Text style={[styles.categoryBadgeText, { color }]}>{label}</Text>
              </View>
            </View>

            {/* Title */}
            <Text style={styles.entryTitle} numberOfLines={1}>
              {item.title}
            </Text>

            {/* Preview */}
            <Text style={styles.entryPreview} numberOfLines={3}>
              {preview}
            </Text>

            {/* Mood indicator */}
            {item.mood && (
              <View style={styles.moodRow}>
                <Ionicons name="happy-outline" size={14} color={Colors.pepTeal} />
                <Text style={styles.moodText}>
                  Mood: {item.mood}/5
                </Text>
              </View>
            )}

            {/* Tags */}
            {item.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {item.tags.map((tag) => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagChipText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </GlassCard>
        </Pressable>
      );
    },
    [router, handleEntryLongPress]
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="journal-outline" size={56} color={Colors.darkTextSecondary} />
      <Text style={styles.emptyTitle}>No journal entries yet</Text>
      <Text style={styles.emptyText}>
        Start tracking your health journey by tapping the + button below.{'\n\n'}
        Record protocol notes, track side effects, log your mood, celebrate progress, and more.
      </Text>
    </View>
  );

  const renderListHeader = () => (
    <View>
      {/* Search bar */}
      {showSearch && (
        <GlassCard style={styles.searchCard}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color={Colors.darkTextSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search entries..."
              placeholderTextColor={Colors.darkTextSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={Colors.darkTextSecondary} />
              </Pressable>
            )}
          </View>
        </GlassCard>
      )}

      {/* Date range filter */}
      <FlatList
        horizontal
        data={DATE_RANGE_OPTIONS}
        keyExtractor={(item) => item.value}
        renderItem={renderDateRangeChip}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateFilterRow}
        scrollEnabled={false}
      />

      {/* Category filter chips */}
      <FlatList
        horizontal
        data={CATEGORY_FILTER_OPTIONS}
        keyExtractor={(item) => item.value}
        renderItem={renderCategoryChip}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      />

      {/* Results count */}
      <Text style={styles.resultCount}>
        {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        {activeCategory !== 'all' || activeDateRange !== 'all' || searchQuery
          ? ' found'
          : ''}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={Colors.darkText} />
        </Pressable>
        <Text style={styles.headerTitle}>My Journal</Text>
        <Pressable
          onPress={() => setShowSearch((v) => !v)}
          style={styles.searchBtn}
        >
          <Ionicons
            name={showSearch ? 'close' : 'search'}
            size={22}
            color={showSearch ? Colors.pepTeal : Colors.darkText}
          />
        </Pressable>
      </View>

      {/* Header banner image */}
      <Image
        source={{ uri: 'https://images.unsplash.com/photo-1517842645767-c639042777db?w=800&q=80' }}
        style={styles.headerBanner}
      />

      {/* Entry list */}
      {/* 2026-05-17 perf: virtualization hints for users with long journal
          histories. renderEntry is already hoisted (good). */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={9}
        removeClippedSubviews
      />

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/journal/new')}
        accessibilityRole="button"
        accessibilityLabel="New journal entry"
      >
        <Ionicons name="add" size={28} color={Colors.darkBg} />
      </Pressable>
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
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#2D2D2D',
  },
  searchBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBanner: {
    width: '100%',
    height: 120,
    borderRadius: 16,
    marginBottom: 16,
    opacity: 0.7,
  },

  // Search
  searchCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.darkText,
    paddingVertical: Spacing.sm,
  },

  // Date range filter
  dateFilterRow: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  dateChipActive: {
    backgroundColor: Colors.pepTeal + '22',
    borderColor: Colors.pepTeal,
  },
  dateChipText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },
  dateChipTextActive: {
    color: Colors.pepTeal,
    fontWeight: '600',
  },

  // Category filters
  filterRow: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    gap: 6,
  },
  filterChipText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
  },

  // Result count
  resultCount: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },

  // List
  listContent: {
    paddingBottom: 100,
  },

  // Entry card
  entryCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  entryDate: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  categoryBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  entryTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.darkText,
    marginBottom: Spacing.xs,
  },
  entryPreview: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  moodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  moodText: {
    fontSize: FontSizes.xs,
    color: Colors.pepTeal,
    fontWeight: '500',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  tagChipText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    marginTop: Spacing.md,
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.darkText,
  },
  emptyText: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.pepTeal,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.pepTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
