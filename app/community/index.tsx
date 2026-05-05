/**
 * Community feed — full v1.
 *
 * - Topic chip filter (All + seeded topics + user-suggested approved)
 * - Sort selector (New / Top today / Top week / Top all)
 * - PostCard list with long-press → Report / Block / Copy actions
 * - Floating compose button (Plus+ gated)
 * - Search + suggest-topic in the header
 *
 * Free users can read + react + report. Plus+ unlocks posting + commenting
 * + topic suggestions.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../src/constants/theme';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import { useCommunityStore } from '../../src/store/useCommunityStore';
import { PostCard } from '../../src/components/community/PostCard';
import {
  REPORT_REASON_LABELS,
  type CommunityReportReason,
} from '../../src/types/community';

type SortMode = 'new' | 'top_today' | 'top_week' | 'top_all';

const SORT_OPTIONS: { mode: SortMode; label: string }[] = [
  { mode: 'new',       label: 'New' },
  { mode: 'top_today', label: 'Top today' },
  { mode: 'top_week',  label: 'Top week' },
  { mode: 'top_all',   label: 'Top all' },
];

export default function CommunityFeedScreen() {
  const t = useTheme();
  const router = useRouter();
  const tier = useSubscriptionStore((s) => s.tier);
  const canPost = tier === 'plus' || tier === 'pro';

  const topics = useCommunityStore((s) => s.topics);
  const posts = useCommunityStore((s) => s.posts);
  const loadingFeed = useCommunityStore((s) => s.loadingFeed);
  const loadingTopics = useCommunityStore((s) => s.loadingTopics);

  const hydrateTopics = useCommunityStore((s) => s.hydrateTopics);
  const hydrateFeed = useCommunityStore((s) => s.hydrateFeed);
  const hydrateBlockedUsers = useCommunityStore((s) => s.hydrateBlockedUsers);
  const hydrateFollowedUsers = useCommunityStore((s) => s.hydrateFollowedUsers);
  const reportContent = useCommunityStore((s) => s.reportContent);
  const blockUser = useCommunityStore((s) => s.blockUser);

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('new');
  const [feedMode, setFeedMode] = useState<'all' | 'following'>('all');

  useEffect(() => {
    hydrateTopics();
    hydrateBlockedUsers();
    hydrateFollowedUsers();
  }, [hydrateTopics, hydrateBlockedUsers, hydrateFollowedUsers]);

  useEffect(() => {
    hydrateFeed({ topicSlug: activeSlug, sort, followingOnly: feedMode === 'following' });
  }, [hydrateFeed, activeSlug, sort, feedMode]);

  const filterChips = useMemo(
    () => [
      { slug: null, name: 'All', icon: 'apps-outline' as const },
      ...topics.map((tp) => ({
        slug: tp.slug,
        name: tp.name,
        icon: (tp.icon ?? 'pricetag-outline') as React.ComponentProps<typeof Ionicons>['name'],
      })),
    ],
    [topics],
  );

  const topicLabel = (slug: string) =>
    topics.find((tp) => tp.slug === slug)?.name ?? slug;

  const handleLongPress = (post: { id: string; userId: string }) => {
    Alert.alert('Post actions', 'What would you like to do?', [
      {
        text: 'Open',
        onPress: () => router.push(`/community/${post.id}` as any),
      },
      {
        text: 'Report',
        onPress: () => promptReport(post.id),
      },
      {
        text: 'Block author',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Block user?', 'You won\'t see their posts or comments.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Block',
              style: 'destructive',
              onPress: async () => {
                const res = await blockUser(post.userId);
                if (!res.ok) Alert.alert('Failed', res.error);
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const promptReport = (postId: string) => {
    const reasons: CommunityReportReason[] = [
      'spam', 'harassment', 'unsafe_medical_advice',
      'misinformation', 'off_topic', 'other',
    ];
    const buttons = reasons.map((r) => ({
      text: REPORT_REASON_LABELS[r],
      onPress: async () => {
        const res = await reportContent({ postId, reason: r });
        if (!res.ok) Alert.alert('Report failed', res.error);
        else Alert.alert('Reported', 'Thanks — we read every report.');
      },
    }));
    Alert.alert('Report', 'Why are you reporting this post?', [
      ...buttons,
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Community</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push('/community/search' as any)}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Ionicons name="search-outline" size={20} color={t.text} />
        </TouchableOpacity>
      </View>

      {/* Topic chip strip */}
      <View style={styles.chipStripWrap}>
        {loadingTopics && topics.length === 0 ? (
          <View style={{ paddingHorizontal: Spacing.md, paddingVertical: 8 }}>
            <ActivityIndicator size="small" color={t.textSecondary} />
          </View>
        ) : (
          <FlatList
            horizontal
            data={filterChips}
            keyExtractor={(item) => item.slug ?? '__all__'}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipStrip}
            renderItem={({ item }) => {
              const active = item.slug === activeSlug;
              return (
                <TouchableOpacity
                  onPress={() => setActiveSlug(item.slug)}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? t.primary : t.cardBorder,
                      backgroundColor: active ? t.primary + '18' : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={item.icon}
                    size={14}
                    color={active ? t.primary : t.textSecondary}
                  />
                  <Text style={[styles.chipText, { color: active ? t.primary : t.text }]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      {/* Feed mode (All / Following) + sort */}
      <View style={styles.sortRow}>
        <TouchableOpacity onPress={() => setFeedMode('all')} style={styles.sortBtn}>
          <Text
            style={[
              styles.sortText,
              { color: feedMode === 'all' ? t.primary : t.textSecondary, fontWeight: feedMode === 'all' ? '700' : '500' },
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFeedMode('following')} style={styles.sortBtn}>
          <Text
            style={[
              styles.sortText,
              { color: feedMode === 'following' ? t.primary : t.textSecondary, fontWeight: feedMode === 'following' ? '700' : '500' },
            ]}
          >
            Following
          </Text>
        </TouchableOpacity>
        <View style={{ width: 1, height: 14, backgroundColor: t.cardBorder, marginHorizontal: 6 }} />
        {SORT_OPTIONS.map((opt) => {
          const active = sort === opt.mode;
          return (
            <TouchableOpacity
              key={opt.mode}
              onPress={() => setSort(opt.mode)}
              style={styles.sortBtn}
            >
              <Text
                style={[
                  styles.sortText,
                  { color: active ? t.primary : t.textSecondary, fontWeight: active ? '700' : '500' },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshing={loadingFeed && posts.length > 0}
        onRefresh={() => hydrateFeed({ topicSlug: activeSlug, sort })}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            topicLabel={topicLabel(item.topicSlug)}
            onPress={() => router.push(`/community/${item.id}` as any)}
            onLongPress={() => handleLongPress({ id: item.id, userId: item.userId })}
          />
        )}
        ListEmptyComponent={
          loadingFeed ? (
            <View style={styles.center}>
              <ActivityIndicator color={t.textSecondary} />
            </View>
          ) : (
            <GlassCard style={styles.heroCard}>
              <View style={[styles.heroIcon, { backgroundColor: t.primary + '22' }]}>
                <Ionicons name="people-outline" size={28} color={t.primary} />
              </View>
              <Text style={[styles.heroTitle, { color: t.text }]}>
                {activeSlug ? 'No posts here yet' : 'Community is just getting started'}
              </Text>
              <Text style={[styles.heroBody, { color: t.textSecondary }]}>
                {canPost
                  ? activeSlug
                    ? `Be the first to post in ${topicLabel(activeSlug)}.`
                    : 'Tap the + button to share something with the community.'
                  : 'Read along while the conversation builds. Plus members can post + comment.'}
              </Text>
              {!canPost && (
                <TouchableOpacity
                  style={[styles.upsellBtn, { backgroundColor: t.primary }]}
                  onPress={() => router.push('/subscription' as any)}
                >
                  <Text style={[styles.upsellBtnText]}>See plans</Text>
                </TouchableOpacity>
              )}
            </GlassCard>
          )
        }
      />

      {/* Floating compose button */}
      {canPost && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: t.primary }]}
          onPress={() => router.push('/community/compose' as any)}
          accessibilityRole="button"
          accessibilityLabel="New post"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  chipStripWrap: { paddingBottom: 4 },
  chipStrip: {
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: FontSizes.xs, fontWeight: '600' },
  sortRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingTop: 6,
    gap: 12,
  },
  sortBtn: { paddingVertical: 4 },
  sortText: { fontSize: FontSizes.xs },
  list: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 100,
    gap: Spacing.sm,
  },
  heroCard: {
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 10,
    marginTop: Spacing.lg,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  heroBody: { fontSize: FontSizes.sm, lineHeight: 20, textAlign: 'center' },
  upsellBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 8,
  },
  upsellBtnText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
});
