import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  FlatList,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { KNOWLEDGE_TOPICS } from '../../src/data/knowledgeTopics';
import { EDUCATIONAL_ARTICLES } from '../../src/data/educationalArticles';
import { GOAL_OPTIONS } from '../../src/constants/goals';
import type { GoalType } from '../../src/types';
import { HOW_TO_GUIDES } from '../../src/data/howToGuides';
import { VIDEOS } from '../../src/data/videos';
import {
  ArticleCategory,
  GuideCategory,
  VideoCategory,
  KnowledgeTopic,
} from '../../src/types';
import {
  Colors,
  FontSizes,
  Spacing,
  BorderRadius,
} from '../../src/constants/theme';

// ── Category filter definitions ─────────────────────────────────────────────

type CategoryFilter =
  | 'all'
  | 'basics'
  | 'safety'
  | 'protocols'
  | 'storage'
  | 'research';

const CATEGORY_FILTERS: { key: CategoryFilter; label: string; icon: string }[] =
  [
    { key: 'all', label: 'All', icon: 'apps-outline' },
    { key: 'basics', label: 'Basics', icon: 'flask-outline' },
    { key: 'safety', label: 'Safety', icon: 'shield-checkmark-outline' },
    { key: 'protocols', label: 'Protocols', icon: 'list-outline' },
    { key: 'storage', label: 'Storage', icon: 'snow-outline' },
    { key: 'research', label: 'Research', icon: 'document-lock-outline' },
  ];

/** Map each topic id to category filter keys it belongs to */
const TOPIC_CATEGORY_MAP: Record<string, CategoryFilter[]> = {
  'peptide-care': ['basics', 'storage'],
  'how-to-use': ['basics', 'protocols'],
  safety: ['safety'],
  storage: ['storage'],
  'buying-quality': ['research'],
  regulations: ['research', 'safety'],
};

// ── Featured topic ids (first two get hero treatment) ───────────────────────

const FEATURED_IDS = ['safety', 'how-to-use'];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getArticleCategoryColor(category: ArticleCategory): string {
  switch (category) {
    case 'fundamentals':
      return '#b9cbb6';
    case 'safety':
      return '#e3a7a1';
    case 'production':
      return '#c7d7e6';
    case 'testing':
      return '#f0d68a';
    case 'regulation':
      return '#F4E9A7';
    case 'delivery':
      return '#06b6d4';
    default:
      return '#6B7280';
  }
}

function getGuideCategoryColor(category: GuideCategory): string {
  switch (category) {
    case 'reconstitution':
      return '#b9cbb6';
    case 'injection':
      return '#e3a7a1';
    case 'storage':
      return '#c7d7e6';
    case 'dosing':
      return '#f0d68a';
    case 'testing':
      return '#F4E9A7';
    case 'general':
      return '#6B7280';
    default:
      return '#6B7280';
  }
}

function getVideoCategoryColor(category: VideoCategory): string {
  switch (category) {
    case 'success_stories':
      return '#b9cbb6';
    case 'how_to':
      return '#e3a7a1';
    case 'research':
      return '#c7d7e6';
    case 'education':
      return '#f0d68a';
    default:
      return '#6B7280';
  }
}

function getVideoCategoryLabel(category: VideoCategory): string {
  switch (category) {
    case 'success_stories':
      return 'Success Stories';
    case 'how_to':
      return 'How-To';
    case 'research':
      return 'Research';
    case 'education':
      return 'Education';
    default:
      return category;
  }
}

// ── Featured Hero Card ──────────────────────────────────────────────────────

function FeaturedTopicCard({
  topic,
  onPress,
}: {
  topic: KnowledgeTopic;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <GlassCard
        variant="glow"
        glowColor={topic.color}
        style={styles.featuredCard}
      >
        <View style={styles.featuredRow}>
          <View
            style={[
              styles.featuredIconWrap,
              { backgroundColor: `${topic.color}22` },
            ]}
          >
            <Ionicons name={topic.icon as any} size={30} color={topic.color} />
          </View>
          <View style={styles.featuredContent}>
            <View
              style={[
                styles.featuredBadge,
                { backgroundColor: `${topic.color}20` },
              ]}
            >
              <Ionicons name="star" size={10} color={topic.color} />
              <Text style={[styles.featuredBadgeText, { color: topic.color }]}>
                Featured
              </Text>
            </View>
            <Text style={styles.featuredTitle}>{topic.title}</Text>
            <Text style={styles.featuredSubtitle} numberOfLines={2}>
              {topic.subtitle}
            </Text>
            <View style={styles.featuredFooter}>
              <Text style={[styles.featuredCount, { color: topic.color }]}>
                {topic.sections.length} topics
              </Text>
              <Ionicons name="arrow-forward" size={16} color={topic.color} />
            </View>
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

// ── Topic Card ──────────────────────────────────────────────────────────────

function TopicCard({
  topic,
  onPress,
}: {
  topic: KnowledgeTopic;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.topicCard, { borderColor: `${topic.color}30` }]}
    >
      <View
        style={[
          styles.topicIconWrap,
          { backgroundColor: `${topic.color}18` },
        ]}
      >
        <Ionicons name={topic.icon as any} size={24} color={topic.color} />
      </View>
      <Text style={styles.topicTitle} numberOfLines={1}>
        {topic.title}
      </Text>
      <Text style={styles.topicSubtitle} numberOfLines={2}>
        {topic.subtitle}
      </Text>
      <View style={styles.topicFooter}>
        <Text style={[styles.topicCount, { color: topic.color }]}>
          {topic.sections.length} topics
        </Text>
        <Ionicons name="chevron-forward" size={14} color={topic.color} />
      </View>
    </TouchableOpacity>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function LearnHubScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  // Goal filter — narrows the Deep Dives feed to articles tagged with
  // the selected goal. 'all' shows everything (no filter). Tagged in
  // src/data/educationalArticles.ts; untagged articles only appear in 'all'.
  const [activeGoal, setActiveGoal] = useState<GoalType | 'all'>('all');

  // Separate featured topics
  const featuredTopics = useMemo(
    () => KNOWLEDGE_TOPICS.filter((t) => FEATURED_IDS.includes(t.id)),
    [],
  );

  // Filter topics by search + category
  const filteredTopics = useMemo(() => {
    let topics = KNOWLEDGE_TOPICS;

    // Category filter
    if (activeCategory !== 'all') {
      topics = topics.filter((t) =>
        (TOPIC_CATEGORY_MAP[t.id] ?? []).includes(activeCategory),
      );
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      topics = topics.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.subtitle.toLowerCase().includes(q) ||
          t.sections.some(
            (s) =>
              s.question.toLowerCase().includes(q) ||
              s.answer.toLowerCase().includes(q),
          ),
      );
    }

    return topics;
  }, [search, activeCategory]);

  const isFiltering = search.trim().length > 0 || activeCategory !== 'all';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={Colors.darkText} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Learn</Text>
            <Text style={styles.headerSubtitle}>
              Everything you need to know about peptides.
            </Text>
          </View>
        </View>

        {/* ── Search Bar ────────────────────────────────────────── */}
        <View style={styles.searchContainer}>
          <Ionicons
            name="search-outline"
            size={18}
            color={Colors.darkTextSecondary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search topics, questions..."
            placeholderTextColor={Colors.darkTextSecondary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8 as any}>
              <Ionicons
                name="close-circle"
                size={18}
                color={Colors.darkTextSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Category Filter Chips ─────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          {CATEGORY_FILTERS.map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                activeOpacity={0.8}
                onPress={() => setActiveCategory(cat.key)}
                style={[
                  styles.chip,
                  isActive && styles.chipActive,
                ]}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={14}
                  color={isActive ? Colors.darkBg : Colors.darkTextSecondary}
                />
                <Text
                  style={[
                    styles.chipText,
                    isActive && styles.chipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Featured Topics (only when not filtering) ─────────── */}
        {!isFiltering && featuredTopics.length > 0 && (
          <View style={styles.featuredSection}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="star-outline" size={18} color={Colors.pepTeal} />
              <Text style={styles.sectionTitle}>Featured</Text>
            </View>
            {featuredTopics.map((topic) => (
              <FeaturedTopicCard
                key={topic.id}
                topic={topic}
                onPress={() => router.push(`/learn/topic/${topic.id}`)}
              />
            ))}
          </View>
        )}

        {/* ── All Topics Grid ───────────────────────────────────── */}
        <View style={styles.gridSection}>
          <View style={styles.sectionTitleRow}>
            <Ionicons
              name="library-outline"
              size={18}
              color={Colors.pepBlue}
            />
            <Text style={styles.sectionTitle}>
              {isFiltering ? 'Results' : 'All Topics'}
            </Text>
            <Text style={styles.sectionCount}>
              {filteredTopics.length}
            </Text>
          </View>

          {filteredTopics.length > 0 ? (
            <View style={styles.topicsGrid}>
              {filteredTopics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  onPress={() => router.push(`/learn/topic/${topic.id}`)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                name="search-outline"
                size={40}
                color={Colors.darkTextSecondary}
              />
              <Text style={styles.emptyText}>No topics found</Text>
              <Text style={styles.emptySubtext}>
                Try a different search term or category.
              </Text>
            </View>
          )}
        </View>

        {/* ── Ask PepTalk CTA ───────────────────────────────────── */}
        <View style={styles.askSection}>
          <View style={styles.askBanner}>
            <Ionicons name="chatbubbles" size={28} color={Colors.pepTeal} />
            <View style={styles.askBannerText}>
              <Text style={styles.askBannerTitle}>Got a question?</Text>
              <Text style={styles.askBannerSubtitle}>
                Ask Aimee anything — the AI knows all this and more.
              </Text>
            </View>
          </View>
          <GradientButton
            label="Ask Aimee"
            onPress={() => router.push('/(tabs)/peptalk')}
            colors={[Colors.pepBlue, Colors.pepTeal]}
          />
        </View>

        {/* ── Deep Dives: Articles ──────────────────────────────── */}
        {EDUCATIONAL_ARTICLES.length > 0 && (
          <View style={styles.sectionWrapper}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={Colors.rose}
                />
                <Text style={styles.sectionTitle}>
                  Deep Dives
                  {activeGoal !== 'all' && (
                    <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '500' }}>
                      {' '}· {GOAL_OPTIONS.find((g) => g.value === activeGoal)?.label}
                    </Text>
                  )}
                </Text>
              </View>
            </View>

            {/* Goal filter chips — narrows the article list to entries
                tagged with the selected goal. "All" returns full list. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.goalChipsRow}
              style={styles.goalChipsScroll}
            >
              <TouchableOpacity
                onPress={() => setActiveGoal('all')}
                style={[
                  styles.goalChip,
                  activeGoal === 'all' && styles.goalChipActive,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: activeGoal === 'all' }}
              >
                <Text style={[
                  styles.goalChipText,
                  activeGoal === 'all' && styles.goalChipTextActive,
                ]}>
                  All
                </Text>
              </TouchableOpacity>
              {GOAL_OPTIONS.map((g) => {
                const active = activeGoal === g.value;
                return (
                  <TouchableOpacity
                    key={g.value}
                    onPress={() => setActiveGoal(g.value)}
                    style={[
                      styles.goalChip,
                      active && { backgroundColor: `${g.color}20`, borderColor: g.color },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={g.icon as any}
                      size={13}
                      color={active ? g.color : '#6B7280'}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[
                      styles.goalChipText,
                      active && { color: g.color, fontWeight: '700' },
                    ]}>
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <FlatList
              data={
                activeGoal === 'all'
                  ? (EDUCATIONAL_ARTICLES as typeof EDUCATIONAL_ARTICLES)
                  : (EDUCATIONAL_ARTICLES as typeof EDUCATIONAL_ARTICLES).filter((a) =>
                      (a.goalTypes ?? []).includes(activeGoal as GoalType),
                    )
              }
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push(`/learn/article/${item.slug}`)
                  }
                >
                  <GlassCard style={styles.articleCard}>
                    {item.imageUrl && (
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={styles.articleCardImage}
                        resizeMode="cover"
                      />
                    )}
                    <View style={styles.articleCardContent}>
                      <View
                        style={[
                          styles.categoryBadge,
                          {
                            backgroundColor: `${getArticleCategoryColor(item.category)}20`,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.categoryBadgeText,
                            {
                              color: getArticleCategoryColor(item.category),
                            },
                          ]}
                        >
                          {item.category}
                        </Text>
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.cardSummary} numberOfLines={3}>
                        {item.summary}
                      </Text>
                      <View style={styles.cardFooter}>
                        <Ionicons
                          name="arrow-forward"
                          size={14}
                          color={Colors.rose}
                        />
                        <Text style={styles.readMore}>Read article</Text>
                      </View>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* ── Step-by-Step Guides ───────────────────────────────── */}
        {HOW_TO_GUIDES.length > 0 && (
          <View style={styles.sectionWrapper}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons
                  name="list-outline"
                  size={18}
                  color={Colors.sage}
                />
                <Text style={styles.sectionTitle}>Step-by-Step Guides</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/learn/guides')}
                activeOpacity={0.7}
              >
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={HOW_TO_GUIDES}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push(`/learn/guides/${item.slug}`)
                  }
                >
                  <GlassCard style={styles.guideCard}>
                    <View
                      style={[
                        styles.categoryBadge,
                        {
                          backgroundColor: `${getGuideCategoryColor(item.category)}20`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryBadgeText,
                          {
                            color: getGuideCategoryColor(item.category),
                          },
                        ]}
                      >
                        {item.category}
                      </Text>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.cardSummary} numberOfLines={3}>
                      {item.summary}
                    </Text>
                    <View style={styles.cardFooter}>
                      <Ionicons
                        name="footsteps-outline"
                        size={14}
                        color={Colors.sage}
                      />
                      <Text style={[styles.readMore, { color: Colors.sage }]}>
                        {item.steps.length} steps
                      </Text>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* ── Videos ────────────────────────────────────────────── */}
        {VIDEOS.length > 0 && (
          <View style={styles.sectionWrapper}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons
                  name="videocam-outline"
                  size={18}
                  color={Colors.powder}
                />
                <Text style={styles.sectionTitle}>Videos</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/learn/videos')}
                activeOpacity={0.7}
              >
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={VIDEOS}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push(`/learn/videos/${item.slug}`)
                  }
                >
                  <GlassCard style={styles.videoCard}>
                    <View style={styles.videoThumbnail}>
                      {item.thumbnailUrl && (
                        <Image
                          source={{ uri: item.thumbnailUrl }}
                          style={styles.videoThumbnailImage}
                          resizeMode="cover"
                        />
                      )}
                      <Ionicons
                        name="play-circle"
                        size={40}
                        color="rgba(0,0,0,0.60)"
                      />
                      {item.duration && (
                        <View style={styles.durationBadge}>
                          <Text style={styles.durationText}>
                            {item.duration}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View
                      style={[
                        styles.categoryBadge,
                        {
                          backgroundColor: `${getVideoCategoryColor(item.category)}20`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryBadgeText,
                          {
                            color: getVideoCategoryColor(item.category),
                          },
                        ]}
                      >
                        {getVideoCategoryLabel(item.category)}
                      </Text>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </GlassCard>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  headerBack: {
    padding: Spacing.xs,
    marginTop: 2,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#2D2D2D',
    letterSpacing: -0.5,
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    lineHeight: 20,
  },

  // ── Search ────────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.darkCardBorder,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.darkText,
    paddingVertical: 0,
  },

  // ── Category Chips ────────────────────────────────────────
  chipsScroll: {
    marginTop: Spacing.md,
    maxHeight: 44,
  },
  chipsRow: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: Colors.darkCardBorder,
  },
  chipActive: {
    backgroundColor: Colors.pepTeal,
    borderColor: Colors.pepTeal,
  },
  chipText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
  },
  chipTextActive: {
    color: Colors.darkBg,
  },

  // ── Featured Section ──────────────────────────────────────
  featuredSection: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  featuredCard: {
    padding: Spacing.md,
  },
  featuredRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  featuredIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredContent: {
    flex: 1,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    marginBottom: 6,
  },
  featuredBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  featuredTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: 4,
  },
  featuredSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 18,
  },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  featuredCount: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },

  // ── Grid Section ──────────────────────────────────────────
  gridSection: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },

  // ── Topics Grid ───────────────────────────────────────────
  topicsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  topicCard: {
    width: '47.5%' as any,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: 14,
    minHeight: 140,
  },
  topicIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  topicTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.bone,
    marginBottom: 4,
  },
  topicSubtitle: {
    fontSize: FontSizes.xs + 1,
    color: Colors.darkTextSecondary,
    lineHeight: 17,
    flex: 1,
  },
  topicFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  topicCount: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '600',
  },

  // ── Empty State ───────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.darkText,
  },
  emptySubtext: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
  },

  // ── Ask PepTalk CTA ──────────────────────────────────────
  askSection: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  askBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    gap: Spacing.md,
  },
  askBannerText: {
    flex: 1,
  },
  askBannerTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.pepTeal,
  },
  askBannerSubtitle: {
    fontSize: FontSizes.xs + 1,
    color: Colors.darkTextSecondary,
    marginTop: 2,
    lineHeight: 17,
  },

  // ── Section ───────────────────────────────────────────────
  sectionWrapper: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: Spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.lg - 1,
    fontWeight: '700',
    color: Colors.darkText,
  },
  sectionCount: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkTextSecondary,
    marginLeft: 4,
  },
  seeAllText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.rose,
  },

  // ── Horizontal List ───────────────────────────────────────
  horizontalList: {
    paddingHorizontal: 20,
    gap: 14,
  },

  // ── Goal filter chips (Deep Dives section) ───────────────
  goalChipsScroll: {
    marginBottom: 10,
  },
  goalChipsRow: {
    paddingHorizontal: 20,
    gap: 6,
    flexDirection: 'row',
  },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  goalChipActive: {
    backgroundColor: 'rgba(62, 124, 177, 0.15)',
    borderColor: '#3E7CB1',
  },
  goalChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  goalChipTextActive: {
    color: '#3E7CB1',
    fontWeight: '700',
  },

  // ── Cards ─────────────────────────────────────────────────
  articleCard: {
    width: 260,
    minHeight: 150,
    padding: 0,
    overflow: 'hidden' as const,
  },
  articleCardImage: {
    width: '100%' as const,
    height: 120,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  articleCardContent: {
    padding: 16,
  },
  guideCard: {
    width: 260,
    minHeight: 150,
  },
  videoCard: {
    width: 240,
    minHeight: 170,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  categoryBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  cardTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.bone,
    marginBottom: 6,
    lineHeight: 20,
  },
  cardSummary: {
    fontSize: FontSizes.xs + 1,
    color: Colors.darkTextSecondary,
    lineHeight: 18,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  readMore: {
    fontSize: FontSizes.xs + 1,
    fontWeight: '600',
    color: Colors.rose,
  },

  // ── Video Thumbnail ───────────────────────────────────────
  videoThumbnail: {
    height: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden' as const,
  },
  videoThumbnailImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%' as const,
    height: '100%' as const,
    opacity: 0.6,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.darkText,
  },
});
