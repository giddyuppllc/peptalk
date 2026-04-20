import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFeedStore } from '../src/store/useFeedStore';
import {
  getCategoryLabel,
  getCategoryIcon,
} from '../src/services/researchFeed';
import { getPeptideById } from '../src/data/peptides';
import { FeedItem, FeedCategory } from '../src/types';
import {
  Colors,
  FontSizes,
  Spacing,
  BorderRadius,
} from '../src/constants/theme';

const CATEGORIES: Array<FeedCategory | 'all'> = [
  'all',
  'research',
  'new_peptides',
  'medical',
  'regulatory',
];

function categoryLabel(cat: FeedCategory | 'all'): string {
  return cat === 'all' ? 'All' : getCategoryLabel(cat);
}

function categoryIcon(cat: FeedCategory | 'all'): string {
  return cat === 'all' ? 'grid' : getCategoryIcon(cat);
}

export default function ResearchFeedScreen() {
  const router = useRouter();
  const {
    digest,
    isLoading,
    error,
    selectedCategory,
    fetchFeed,
    setCategory,
    getFilteredItems,
  } = useFeedStore();

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const items = getFilteredItems();

  const handleRefresh = useCallback(() => {
    // Force refetch by clearing lastFetchDate
    useFeedStore.setState({ lastFetchDate: null });
    fetchFeed();
  }, [fetchFeed]);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <TouchableOpacity
        style={styles.card}
        onPress={() => Linking.openURL(item.url)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: categoryColor(item.category) },
            ]}
          >
            <Ionicons
              name={getCategoryIcon(item.category) as any}
              size={12}
              color={Colors.darkBg}
            />
            <Text style={styles.categoryBadgeText}>
              {getCategoryLabel(item.category)}
            </Text>
          </View>
          <Ionicons
            name="open-outline"
            size={14}
            color={Colors.darkTextSecondary}
          />
        </View>

        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardSummary}>{item.summary}</Text>

        {item.authors && (
          <Text style={styles.cardAuthors}>{item.authors}</Text>
        )}

        {item.relatedPeptideIds && item.relatedPeptideIds.length > 0 && (
          <View style={styles.relatedRow}>
            {item.relatedPeptideIds.slice(0, 3).map((pid) => {
              const p = getPeptideById(pid);
              return p ? (
                <View key={pid} style={styles.peptideChip}>
                  <Text style={styles.peptideChipText}>{p.name}</Text>
                </View>
              ) : null;
            })}
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.cardSource}>{item.source}</Text>
          <Text style={styles.cardDate}>
            {new Date(item.publishedAt).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    []
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Research Feed</Text>
          <Text style={styles.headerSubtitle}>
            {digest ? `Updated ${digest.date}` : 'Daily peptide intelligence'}
          </Text>
        </View>
      </View>

      {/* Category Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setCategory(cat)}
            >
              <Ionicons
                name={categoryIcon(cat) as any}
                size={14}
                color={active ? Colors.darkBg : Colors.darkTextSecondary}
              />
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {categoryLabel(cat)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      {isLoading && !digest ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.rose} />
          <Text style={styles.loadingText}>
            Fetching latest research from PubMed...
          </Text>
        </View>
      ) : error && !digest ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline" size={48} color={Colors.darkTextSecondary} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={handleRefresh}
              tintColor={Colors.rose}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                No articles found in this category.
              </Text>
            </View>
          }
          ListHeaderComponent={
            <View style={styles.digestHeader}>
              <Ionicons name="newspaper" size={20} color={Colors.rose} />
              <Text style={styles.digestHeaderText}>
                {items.length} article{items.length !== 1 ? 's' : ''}{' '}
                {selectedCategory !== 'all'
                  ? `in ${categoryLabel(selectedCategory)}`
                  : 'across all categories'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function categoryColor(cat: FeedCategory): string {
  switch (cat) {
    case 'research':
      return Colors.powder;
    case 'new_peptides':
      return Colors.sage;
    case 'medical':
      return Colors.rose;
    case 'regulatory':
      return '#f0d68a';
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.darkCardBorder,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.darkText,
  },
  headerSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
  },
  filterRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.darkCard,
    borderWidth: 1,
    borderColor: Colors.darkCardBorder,
  },
  filterChipActive: {
    backgroundColor: Colors.rose,
    borderColor: Colors.rose,
  },
  filterChipText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: Colors.darkBg,
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  digestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  digestHeaderText: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
  },
  card: {
    backgroundColor: Colors.darkCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.darkCardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.darkBg,
  },
  cardTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
    lineHeight: 22,
    marginBottom: 6,
  },
  cardSummary: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 19,
    marginBottom: 6,
  },
  cardAuthors: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    fontStyle: 'italic',
    marginBottom: 8,
    opacity: 0.7,
  },
  relatedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  peptideChip: {
    backgroundColor: 'rgba(227, 167, 161, 0.15)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
  },
  peptideChipText: {
    fontSize: 11,
    color: Colors.rose,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardSource: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    fontWeight: '600',
  },
  cardDate: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    marginTop: Spacing.sm,
  },
  errorText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.rose,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.full,
  },
  retryText: {
    color: Colors.darkBg,
    fontWeight: '700',
    fontSize: FontSizes.md,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
  },
});
