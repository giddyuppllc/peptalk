/**
 * PostCard — feed-row representation of a community post.
 *
 * Tap → post detail. Long-press → action sheet (Report / Block / Copy link).
 * Author is shown as "Anonymous member" when post.author?.displayName matches
 * — the store hydrates that label when is_anonymous is true on the row.
 */

import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../hooks/useTheme';
import { Spacing, FontSizes } from '../../constants/theme';
import type { CommunityPost } from '../../types/community';

interface PostCardProps {
  post: CommunityPost;
  topicLabel?: string;
  onPress: () => void;
  onLongPress?: () => void;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`;
  if (ms < 7 * 86400_000) return `${Math.floor(ms / 86400_000)}d`;
  return new Date(iso).toLocaleDateString();
}

export function PostCard({ post, topicLabel, onPress, onLongPress }: PostCardProps) {
  const t = useTheme();

  const authorName =
    post.author?.displayName?.trim() ||
    post.author?.username?.trim() ||
    'Member';

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Open post: ${post.title}`}
    >
      <GlassCard style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: t.primary + '22' }]}>
            <Ionicons name="person-outline" size={14} color={t.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.author, { color: t.text }]} numberOfLines={1}>
              {authorName}
            </Text>
            <View style={styles.metaRow}>
              {topicLabel && (
                <View style={[styles.topicChip, { backgroundColor: t.primary + '12' }]}>
                  <Text style={[styles.topicText, { color: t.primary }]}>{topicLabel}</Text>
                </View>
              )}
              <Text style={[styles.metaTime, { color: t.textSecondary }]}>
                {relativeTime(post.createdAt)}
              </Text>
            </View>
          </View>
          {onLongPress && (
            <TouchableOpacity
              onPress={onLongPress}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Post actions"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={t.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
          {post.title}
        </Text>
        <Text style={[styles.body, { color: t.textSecondary }]} numberOfLines={3}>
          {post.body}
        </Text>

        <View style={styles.footer}>
          <View style={styles.footerStat}>
            <Ionicons name="heart-outline" size={14} color={t.textSecondary} />
            <Text style={[styles.footerStatText, { color: t.textSecondary }]}>
              {post.reactionCount}
            </Text>
          </View>
          <View style={styles.footerStat}>
            <Ionicons name="chatbubble-outline" size={14} color={t.textSecondary} />
            <Text style={[styles.footerStatText, { color: t.textSecondary }]}>
              {post.commentCount}
            </Text>
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  author: { fontSize: FontSizes.sm, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  topicChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  topicText: { fontSize: 10, fontWeight: '700' },
  metaTime: { fontSize: 11 },
  title: { fontSize: FontSizes.md, fontWeight: '700', lineHeight: 20 },
  body: { fontSize: FontSizes.sm, lineHeight: 18 },
  footer: { flexDirection: 'row', gap: 16, marginTop: 4 },
  footerStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerStatText: { fontSize: FontSizes.xs, fontWeight: '600' },
});
