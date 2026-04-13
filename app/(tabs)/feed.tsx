import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { Disclaimer } from '../../src/components/Disclaimer';
import { useFeedStore } from '../../src/store/useFeedStore';
import { getPeptideById } from '../../src/data/peptides';
import {
  getCategoryLabel,
  getCategoryIcon,
} from '../../src/services/researchFeed';
import { FeedItem, FeedCategory } from '../../src/types';
import { useTheme } from '../../src/hooks/useTheme';

// ─── Category filters ────────────────────────────────────────────────────────

const CATEGORIES: Array<{ key: FeedCategory | 'all'; label: string; icon: string }> = [
  { key: 'all', label: 'All', icon: 'layers-outline' },
  { key: 'research', label: 'Research', icon: 'flask-outline' },
  { key: 'new_peptides', label: 'New Peptides', icon: 'sparkles-outline' },
  { key: 'medical', label: 'Medical', icon: 'medkit-outline' },
  { key: 'regulatory', label: 'Regulatory', icon: 'shield-checkmark-outline' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getCategoryColor(category: FeedCategory): string {
  switch (category) {
    case 'research':
      return '#c7d7e6';
    case 'new_peptides':
      return '#f0d68a';
    case 'medical':
      return '#e3a7a1';
    case 'regulatory':
      return '#b9cbb6';
  }
}

// ─── Category image mapping ──────────────────────────────────────────────────

function getCategoryImage(category: FeedCategory): string {
  switch (category) {
    case 'medical':
      return 'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=400&q=80';
    case 'regulatory':
      return 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&q=80';
    case 'research':
      return 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=80';
    default:
      return 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=400&q=80';
  }
}

// ─── Feed Item Card ──────────────────────────────────────────────────────────

function FeedItemCard({ item }: { item: FeedItem }) {
  const t = useTheme();
  const router = useRouter();
  const catColor = getCategoryColor(item.category);

  const relatedPeptides = (item.relatedPeptideIds ?? [])
    .map((id) => getPeptideById(id))
    .filter(Boolean);

  const handlePress = () => {
    if (item.url) {
      Linking.openURL(item.url);
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={handlePress}>
      <GlassCard style={styles.feedCard}>
        {/* Category image + content row */}
        <View style={styles.feedCardRow}>
          <Image
            source={{ uri: getCategoryImage(item.category) }}
            style={styles.feedCardImage}
          />
          <View style={styles.feedCardContent}>
        {/* Category + Date row */}
        <View style={styles.feedCardMeta}>
          <View style={[styles.categoryPill, { backgroundColor: `${catColor}18` }]}>
            <Ionicons
              name={getCategoryIcon(item.category) as any}
              size={11}
              color={catColor}
            />
            <Text style={[styles.categoryPillText, { color: catColor }]}>
              {getCategoryLabel(item.category)}
            </Text>
          </View>
          <Text style={[styles.feedDate, { color: t.textSecondary }]}>{formatDate(item.publishedAt)}</Text>
        </View>

        {/* Title */}
        <Text style={[styles.feedTitle, { color: t.text }]} numberOfLines={3}>
          {item.title}
        </Text>

        {/* Summary */}
        <Text style={[styles.feedSummary, { color: t.textSecondary }]} numberOfLines={2}>
          {item.summary}
        </Text>

        {/* Authors */}
        {item.authors && (
          <Text style={[styles.feedAuthors, { color: t.textSecondary }]} numberOfLines={1}>
            {item.authors}
          </Text>
        )}

        {/* Related peptide tags */}
        {relatedPeptides.length > 0 && (
          <View style={styles.peptideTags}>
            {relatedPeptides.slice(0, 3).map((p) => (
              <TouchableOpacity
                key={p!.id}
                style={styles.peptideTag}
                onPress={() => router.push(`/peptide/${p!.id}`)}
              >
                <Text style={[styles.peptideTagText, { color: t.isDark ? '#b9cbb6' : '#3d6b35' }]}>
                  {p!.abbreviation || p!.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Source + external link indicator */}
        <View style={[styles.sourceRow, { borderTopColor: t.glassBorder }]}>
          <Text style={[styles.sourceText, { color: t.textSecondary }]}>{item.source}</Text>
          <Ionicons name="open-outline" size={12} color={t.textSecondary} />
        </View>
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const t = useTheme();
  const router = useRouter();
  const {
    isLoading,
    error,
    selectedCategory,
    fetchFeed,
    setCategory,
    getFilteredItems,
    digest,
  } = useFeedStore();

  const items = getFilteredItems();

  // Auto-fetch on mount
  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const handleRefresh = useCallback(() => {
    // Force refetch by clearing lastFetchDate first
    useFeedStore.setState({ lastFetchDate: null });
    fetchFeed();
  }, [fetchFeed]);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => <FeedItemCard item={item} />,
    []
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  // ─── Header component (rendered inside FlatList) ─────────────────────────

  const ListHeader = (
    <>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: t.text }]}>Research Feed</Text>
            <Text style={[styles.subtitle, { color: t.textSecondary }]}>
              Latest peptide research from PubMed
            </Text>
          </View>
          <TouchableOpacity
            style={styles.learnButton}
            onPress={() => router.push('/learn')}
          >
            <Ionicons name="book-outline" size={18} color="#e3a7a1" />
            <Text style={styles.learnButtonText}>Learn</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.filterChip,
                { backgroundColor: t.glass, borderColor: t.glassBorder },
                isActive ? styles.filterChipActive : undefined,
              ]}
              onPress={() => setCategory(cat.key)}
            >
              <Ionicons
                name={cat.icon as any}
                size={14}
                color={isActive ? '#2D2D2D' : t.textSecondary}
              />
              <Text
                style={[
                  styles.filterChipText,
                  { color: t.textSecondary },
                  isActive ? styles.filterChipTextActive : undefined,
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Item count */}
      {digest && !isLoading && (
        <Text style={[styles.itemCount, { color: t.textSecondary }]}>
          {items.length} article{items.length !== 1 ? 's' : ''}
          {selectedCategory !== 'all'
            ? ` in ${getCategoryLabel(selectedCategory as FeedCategory)}`
            : ''}
        </Text>
      )}

      {/* Error state */}
      {error && (
        <GlassCard style={styles.errorCard}>
          <Ionicons name="cloud-offline-outline" size={24} color="#e3a7a1" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </GlassCard>
      )}

      {/* Initial loading state */}
      {isLoading && !digest && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e3a7a1" />
          <Text style={[styles.loadingText, { color: t.textSecondary }]}>
            Fetching latest research from PubMed...
          </Text>
        </View>
      )}
    </>
  );

  // ─── Empty state ─────────────────────────────────────────────────────────

  const ListEmpty = !isLoading && !error ? (
    <GlassCard style={styles.emptyCard}>
      <Ionicons name="document-text-outline" size={40} color="#6b7280" />
      <Text style={[styles.emptyTitle, { color: t.text }]}>No Articles Found</Text>
      <Text style={[styles.emptyText, { color: t.textSecondary }]}>
        {selectedCategory !== 'all'
          ? `No ${getCategoryLabel(selectedCategory as FeedCategory).toLowerCase()} articles available. Try a different category.`
          : 'Pull down to refresh and fetch the latest research.'}
      </Text>
    </GlassCard>
  ) : null;

  // ─── Footer ──────────────────────────────────────────────────────────────

  const ListFooter = items.length > 0 ? (
    <View style={styles.footer}>
      <Text style={[styles.footerText, { color: t.textSecondary }]}>
        Data sourced from PubMed (NCBI). Articles open in your browser.
      </Text>
      <Disclaimer />
    </View>
  ) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <FlatList
        data={isLoading && !digest ? [] : items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && !!digest}
            onRefresh={handleRefresh}
            tintColor="#e3a7a1"
            colors={['#e3a7a1']}
          />
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2D2D2D',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Header
  header: {
    paddingTop: 16,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#2D2D2D',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  learnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(227, 167, 161, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(227, 167, 161, 0.2)',
  },
  learnButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e3a7a1',
  },

  // Filters
  filterScroll: {
    marginTop: 16,
    marginBottom: 8,
  },
  filterContent: {
    gap: 8,
    paddingRight: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterChipActive: {
    backgroundColor: '#e3a7a1',
    borderColor: '#e3a7a1',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#2D2D2D',
  },

  // Item count
  itemCount: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 4,
  },

  // Feed cards
  feedCard: {
    marginTop: 12,
    padding: 16,
  },
  feedCardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  feedCardImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  feedCardContent: {
    flex: 1,
  },
  feedCardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  feedDate: {
    fontSize: 11,
    color: '#6b7280',
  },
  feedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2D2D',
    lineHeight: 21,
    marginBottom: 6,
  },
  feedSummary: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
    marginBottom: 6,
  },
  feedAuthors: {
    fontSize: 11,
    color: '#6b7280',
    fontStyle: 'italic',
    marginBottom: 8,
  },

  // Related peptide tags
  peptideTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  peptideTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(185, 203, 182, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(185, 203, 182, 0.25)',
  },
  peptideTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b9cbb6',
  },

  // Source row
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  sourceText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },

  // Error state
  errorCard: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#e3a7a1',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(227, 167, 161, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(227, 167, 161, 0.3)',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e3a7a1',
  },

  // Loading state
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },

  // Empty state
  emptyCard: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 20,
  },

  // Footer
  footer: {
    marginTop: 20,
  },
  footerText: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
});
