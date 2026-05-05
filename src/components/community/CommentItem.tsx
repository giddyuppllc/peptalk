/**
 * CommentItem — single comment row with author, body, time, reaction row,
 * and a long-press action sheet for Report / Block. v1 is single-level
 * nesting; replies-to-comments still render in the same flat list,
 * indented when parent_comment_id is set.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { Spacing, FontSizes } from '../../constants/theme';
import { ReactionRow } from './ReactionRow';
import type { CommunityComment } from '../../types/community';

interface CommentItemProps {
  comment: CommunityComment;
  isReply?: boolean;
  onReply?: () => void;
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

export function CommentItem({ comment, isReply, onReply, onLongPress }: CommentItemProps) {
  const t = useTheme();
  const authorName =
    comment.author?.displayName?.trim() ||
    comment.author?.username?.trim() ||
    'Member';

  return (
    <TouchableOpacity
      onLongPress={onLongPress}
      activeOpacity={0.9}
      style={[
        styles.row,
        { borderBottomColor: t.cardBorder },
        isReply && { paddingLeft: 24, backgroundColor: t.cardBorder + '20' },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.avatar, { backgroundColor: t.primary + '22' }]}>
          <Ionicons name="person-outline" size={12} color={t.primary} />
        </View>
        <Text style={[styles.author, { color: t.text }]} numberOfLines={1}>
          {authorName}
        </Text>
        <Text style={[styles.time, { color: t.textSecondary }]}>· {relativeTime(comment.createdAt)}</Text>
        <View style={{ flex: 1 }} />
        {onLongPress && (
          <TouchableOpacity
            onPress={onLongPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Comment actions"
          >
            <Ionicons name="ellipsis-horizontal" size={14} color={t.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.body, { color: t.text }]}>{comment.body}</Text>

      <View style={styles.actionsRow}>
        <ReactionRow commentId={comment.id} initialCount={comment.reactionCount} />
        {onReply && (
          <TouchableOpacity onPress={onReply} accessibilityRole="button" accessibilityLabel="Reply">
            <Text style={[styles.replyText, { color: t.primary }]}>Reply</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    gap: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  author: { fontSize: FontSizes.xs, fontWeight: '700' },
  time: { fontSize: 11 },
  body: { fontSize: FontSizes.sm, lineHeight: 19 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  replyText: { fontSize: FontSizes.xs, fontWeight: '700' },
});
