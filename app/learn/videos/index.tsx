import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../../src/components/GlassCard';
import { VIDEOS, getFeaturedVideos } from '../../../src/data/videos';
import { VideoCategory } from '../../../src/types';

// ── Constants ────────────────────────────────────────────────────

type FilterOption = 'all' | VideoCategory;

const FILTER_OPTIONS: { key: FilterOption; label: string }[] = [
  { key: 'all',             label: 'All' },
  { key: 'success_stories', label: 'Success Stories' },
  { key: 'how_to',          label: 'How-To' },
  { key: 'research',        label: 'Research' },
  { key: 'education',       label: 'Education' },
];

function getCategoryColor(category: VideoCategory): string {
  switch (category) {
    case 'success_stories': return '#b9cbb6';
    case 'how_to':          return '#e3a7a1';
    case 'research':        return '#c7d7e6';
    case 'education':       return '#f0d68a';
    default:                return '#6B7280';
  }
}

function getCategoryLabel(category: VideoCategory): string {
  switch (category) {
    case 'success_stories': return 'Success Stories';
    case 'how_to':          return 'How-To';
    case 'research':        return 'Research';
    case 'education':       return 'Education';
    default:                return category;
  }
}

// ── Component ────────────────────────────────────────────────────

export default function VideoGalleryScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');

  const featuredVideos = useMemo(() => getFeaturedVideos(), []);

  const filteredVideos = useMemo(() => {
    if (activeFilter === 'all') return VIDEOS;
    return VIDEOS.filter((v) => v.category === activeFilter);
  }, [activeFilter]);

  // If no videos at all, show the empty state
  if (VIDEOS.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color="#2D2D2D" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Videos</Text>
              <Text style={styles.headerSubtitle}>
                Watch and learn from expert peptide content.
              </Text>
            </View>
          </View>

          <GlassCard style={styles.emptyCard}>
            <Ionicons name="videocam-outline" size={48} color="#6B7280" />
            <Text style={styles.emptyTitle}>Coming Soon</Text>
            <Text style={styles.emptyText}>
              Videos coming soon — check back for success stories, research talks, and how-to guides.
            </Text>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color="#2D2D2D" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Videos</Text>
            <Text style={styles.headerSubtitle}>
              Watch and learn from expert peptide content.
            </Text>
          </View>
        </View>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {FILTER_OPTIONS.map((opt) => {
            const isActive = activeFilter === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.filterChip,
                  isActive && styles.filterChipActive,
                ]}
                onPress={() => setActiveFilter(opt.key)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isActive && styles.filterChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Featured Videos (only show when filter is 'all' and there are featured videos) */}
        {activeFilter === 'all' && featuredVideos.length > 0 && (
          <View style={styles.featuredSection}>
            <View style={styles.featuredHeader}>
              <Ionicons name="star" size={16} color="#f0d68a" />
              <Text style={styles.featuredTitle}>Featured</Text>
            </View>
            <FlatList
              data={featuredVideos}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featuredList}
              renderItem={({ item }) => {
                const color = getCategoryColor(item.category);
                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => router.push(`/learn/videos/${item.slug}`)}
                  >
                    <GlassCard variant="elevated" style={styles.featuredCard}>
                      <View style={styles.featuredThumbnail}>
                        <Ionicons
                          name="play-circle"
                          size={48}
                          color="rgba(255,255,255,0.85)"
                        />
                        {item.duration && (
                          <View style={styles.durationBadge}>
                            <Text style={styles.durationText}>{item.duration}</Text>
                          </View>
                        )}
                      </View>
                      <View
                        style={[
                          styles.categoryBadge,
                          { backgroundColor: `${color}20` },
                        ]}
                      >
                        <Text style={[styles.categoryBadgeText, { color }]}>
                          {getCategoryLabel(item.category)}
                        </Text>
                      </View>
                      <Text style={styles.featuredCardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.featuredCardDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                    </GlassCard>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* All Videos (vertical list) */}
        {filteredVideos.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Ionicons name="videocam-outline" size={32} color="#6B7280" />
            <Text style={styles.emptyText}>
              No videos found for this category.
            </Text>
          </GlassCard>
        ) : (
          filteredVideos.map((video) => {
            const color = getCategoryColor(video.category);
            return (
              <TouchableOpacity
                key={video.id}
                activeOpacity={0.8}
                onPress={() => router.push(`/learn/videos/${video.slug}`)}
              >
                <GlassCard style={styles.videoCard}>
                  <View style={styles.videoCardContent}>
                    {/* Play Icon */}
                    <View style={styles.playIconContainer}>
                      <Ionicons
                        name="play-circle"
                        size={36}
                        color="rgba(0,0,0,0.50)"
                      />
                    </View>

                    {/* Info */}
                    <View style={styles.videoInfo}>
                      <View style={styles.videoCardHeader}>
                        <View
                          style={[
                            styles.categoryBadgeSmall,
                            { backgroundColor: `${color}20` },
                          ]}
                        >
                          <Text
                            style={[styles.categoryBadgeSmallText, { color }]}
                          >
                            {getCategoryLabel(video.category)}
                          </Text>
                        </View>
                        {video.duration && (
                          <View style={styles.durationBadgeSmall}>
                            <Ionicons name="time-outline" size={10} color="#6B7280" />
                            <Text style={styles.durationSmallText}>
                              {video.duration}
                            </Text>
                          </View>
                        )}
                        {/PLACEHOLDER/i.test(video.videoUrl) && (
                          <View style={styles.durationBadgeSmall}>
                            <Text style={styles.durationSmallText}>Coming soon</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.videoTitle} numberOfLines={2}>
                        {video.title}
                      </Text>
                    </View>

                    {/* Chevron */}
                    <Ionicons name="chevron-forward" size={18} color="#6B7280" />
                  </View>
                </GlassCard>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDE6D6',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ── Header ─────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2D2D2D',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
  },

  // ── Filter Chips ───────────────────────────────────────────
  filterScroll: {
    marginVertical: 16,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(227, 167, 161, 0.2)',
    borderColor: 'rgba(227, 167, 161, 0.4)',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#e3a7a1',
  },

  // ── Featured Section ───────────────────────────────────────
  featuredSection: {
    marginBottom: 24,
  },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  featuredTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f0d68a',
  },
  featuredList: {
    paddingHorizontal: 20,
    gap: 14,
  },
  featuredCard: {
    width: 300,
  },
  featuredThumbnail: {
    height: 120,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  featuredCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 4,
    lineHeight: 22,
  },
  featuredCardDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },

  // ── Video Cards (list) ─────────────────────────────────────
  videoCard: {
    marginHorizontal: 20,
    marginBottom: 10,
  },
  videoCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoInfo: {
    flex: 1,
  },
  videoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  categoryBadgeSmall: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryBadgeSmallText: {
    fontSize: 10,
    fontWeight: '700',
  },
  durationBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  durationSmallText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  videoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D2D',
    lineHeight: 20,
  },

  // ── Empty State ────────────────────────────────────────────
  emptyCard: {
    marginHorizontal: 20,
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
    lineHeight: 20,
    paddingHorizontal: 20,
  },
});
