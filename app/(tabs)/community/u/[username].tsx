/**
 * Community user profile — shows a user's recent posts.
 *
 * Routed from PostCard taps on author. Displays display_name + handle +
 * post list. No follow / no DM in v1.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../../../src/components/GlassCard';
import { useTheme } from '../../../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../../../src/constants/theme';
import { PostCard } from '../../../../src/components/community/PostCard';
import { useCommunityStore } from '../../../../src/store/useCommunityStore';
import { useAuthStore } from '../../../../src/store/useAuthStore';
import type { CommunityPost } from '../../../../src/types/community';

export default function CommunityUserProfile() {
  const t = useTheme();
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const handle = String(username ?? '').replace(/^@/, '');

  const topics = useCommunityStore((s) => s.topics);
  const followedUserIds = useCommunityStore((s) => s.followedUserIds);
  const followUser = useCommunityStore((s) => s.followUser);
  const unfollowUser = useCommunityStore((s) => s.unfollowUser);
  const myUserId = useAuthStore((s) => s.user?.id);

  const [profile, setProfile] = useState<{ id: string; username?: string; displayName?: string; avatarUrl?: string } | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  const isFollowing = profile ? followedUserIds.includes(profile.id) : false;
  const isSelf = profile?.id === myUserId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import('../../../../src/services/supabase');
        const { data: profileRow } = await (supabase as any)
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .ilike('username', handle)
          .maybeSingle();

        if (cancelled || !profileRow) {
          setLoading(false);
          return;
        }

        setProfile({
          id: profileRow.id,
          username: profileRow.username ?? undefined,
          displayName: profileRow.display_name ?? undefined,
          avatarUrl: profileRow.avatar_url ?? undefined,
        });

        const { data: postRows } = await (supabase as any)
          .from('community_posts')
          .select('id, user_id, topic_slug, title, body, reaction_count, comment_count, is_deleted, is_anonymous, created_at, updated_at')
          .eq('user_id', profileRow.id)
          .eq('is_deleted', false)
          .eq('is_anonymous', false)
          .order('created_at', { ascending: false })
          .limit(50);

        if (cancelled) return;
        setPosts((postRows ?? []).map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          topicSlug: r.topic_slug,
          title: r.title,
          body: r.body,
          isDeleted: !!r.is_deleted,
          reactionCount: r.reaction_count ?? 0,
          commentCount: r.comment_count ?? 0,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          author: {
            id: profileRow.id,
            username: profileRow.username ?? undefined,
            displayName: profileRow.display_name ?? undefined,
          },
        })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const topicLabel = (slug: string) =>
    topics.find((tp) => tp.slug === slug)?.name ?? slug;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]} numberOfLines={1}>
          @{handle}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.textSecondary} />
        </View>
      ) : !profile ? (
        <View style={styles.center}>
          <Text style={{ color: t.textSecondary }}>User not found.</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <GlassCard style={styles.profileCard}>
              <View style={[styles.avatar, { backgroundColor: t.primary + '22' }]}>
                <Ionicons name="person-outline" size={26} color={t.primary} />
              </View>
              <Text style={[styles.displayName, { color: t.text }]} numberOfLines={1}>
                {profile.displayName || profile.username || 'Member'}
              </Text>
              {profile.username && (
                <Text style={[styles.handle, { color: t.textSecondary }]}>@{profile.username}</Text>
              )}
              <Text style={[styles.postCount, { color: t.textSecondary }]}>
                {posts.length} public post{posts.length === 1 ? '' : 's'}
              </Text>
              {!isSelf && (
                <TouchableOpacity
                  disabled={following}
                  style={[
                    styles.followBtn,
                    {
                      backgroundColor: isFollowing ? 'transparent' : t.primary,
                      borderColor: isFollowing ? t.cardBorder : t.primary,
                      opacity: following ? 0.6 : 1,
                    },
                  ]}
                  onPress={async () => {
                    setFollowing(true);
                    const res = isFollowing
                      ? await unfollowUser(profile.id)
                      : await followUser(profile.id);
                    setFollowing(false);
                    if (!res.ok) Alert.alert('Failed', (res as any).error ?? '');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={isFollowing ? 'Unfollow' : 'Follow'}
                >
                  <Text
                    style={[
                      styles.followText,
                      { color: isFollowing ? t.text : '#fff' },
                    ]}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              )}
            </GlassCard>
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              topicLabel={topicLabel(item.topicSlug)}
              onPress={() => router.push(`/community/${item.id}` as any)}
            />
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: t.textSecondary }]}>
              No public posts yet.
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 40, gap: Spacing.sm },
  profileCard: {
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  displayName: { fontSize: FontSizes.lg, fontWeight: '800' },
  handle: { fontSize: FontSizes.xs, fontWeight: '600' },
  postCount: { fontSize: 11, marginTop: 4 },
  followBtn: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  followText: { fontSize: FontSizes.xs, fontWeight: '700' },
  empty: { padding: 30, fontSize: FontSizes.sm, textAlign: 'center' },
});
