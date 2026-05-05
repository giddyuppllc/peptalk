/**
 * Post detail — full body + comment thread + reaction row + composer.
 *
 * Long-press a post or comment opens the action sheet (Report / Block).
 * Replying to a comment threads as parent_comment_id; v1 renders both
 * top-level and replies in the same flat list, with replies indented.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../src/constants/theme';
import { useCommunityStore } from '../../src/store/useCommunityStore';
import { ReactionRow } from '../../src/components/community/ReactionRow';
import { CommentItem } from '../../src/components/community/CommentItem';
import {
  REPORT_REASON_LABELS,
  type CommunityReportReason,
} from '../../src/types/community';

export default function PostDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id ?? '');

  const detail = useCommunityStore((s) => s.postDetails[postId]);
  const loading = useCommunityStore((s) => !!s.loadingDetail[postId]);
  const hydrate = useCommunityStore((s) => s.hydratePostDetail);
  const createComment = useCommunityStore((s) => s.createComment);
  const reportContent = useCommunityStore((s) => s.reportContent);
  const blockUser = useCommunityStore((s) => s.blockUser);

  const [commentDraft, setCommentDraft] = useState('');
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [commentAnonymous, setCommentAnonymous] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    if (!postId) return;
    hydrate(postId).catch(() => {});
  }, [postId, hydrate]);

  const post = detail?.post;
  const comments = detail?.comments ?? [];

  const submitComment = async () => {
    const text = commentDraft.trim();
    if (!text || submittingComment) return;
    setSubmittingComment(true);
    const res = await createComment({
      postId,
      parentCommentId: replyingToCommentId ?? null,
      body: text,
      isAnonymous: commentAnonymous,
    });
    setSubmittingComment(false);

    if (res.ok) {
      setCommentDraft('');
      setReplyingToCommentId(null);
      return;
    }

    if ((res as any).needsUsername) {
      Alert.alert('Pick a handle first', 'You need a community username before commenting.', [
        { text: 'Set username', onPress: () => router.push('/community/setup-username' as any) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    if ((res as any).upgrade) {
      Alert.alert('Upgrade required', res.error, [
        { text: 'See plans', onPress: () => router.push('/subscription' as any) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    Alert.alert('Could not comment', res.error);
  };

  const showActions = (target: { postId?: string; commentId?: string; userId: string }) => {
    Alert.alert('Actions', 'What would you like to do?', [
      {
        text: 'Report',
        onPress: () => promptReport(target),
      },
      {
        text: 'Block user',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Block user?', 'You won\'t see their posts or comments anywhere in the community.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Block',
              style: 'destructive',
              onPress: async () => {
                const res = await blockUser(target.userId);
                if (!res.ok) Alert.alert('Block failed', res.error);
                else {
                  Alert.alert('Blocked', 'You won\'t see their content anymore.');
                  router.back();
                }
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const promptReport = (target: { postId?: string; commentId?: string }) => {
    const reasons: CommunityReportReason[] = [
      'spam', 'harassment', 'unsafe_medical_advice',
      'misinformation', 'off_topic', 'other',
    ];
    const buttons = reasons.map((r) => ({
      text: REPORT_REASON_LABELS[r],
      onPress: async () => {
        const res = await reportContent({ ...target, reason: r });
        if (!res.ok) Alert.alert('Report failed', res.error);
        else Alert.alert('Reported', 'Thanks — we read every report.');
      },
    }));
    Alert.alert('Report this content', 'Why are you reporting it?', [
      ...buttons,
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (!postId) return null;

  if (loading && !post) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={t.textSecondary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!post || post.isDeleted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: t.text }]}>Post</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text style={{ color: t.textSecondary }}>This post was removed.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const authorName =
    post.author?.displayName?.trim() ||
    post.author?.username?.trim() ||
    'Member';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]} numberOfLines={1}>Post</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => showActions({ postId, userId: post.userId })}
          accessibilityRole="button"
          accessibilityLabel="Post actions"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={t.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <GlassCard style={styles.postCard}>
            <View style={styles.authorRow}>
              <View style={[styles.avatar, { backgroundColor: t.primary + '22' }]}>
                <Ionicons name="person-outline" size={14} color={t.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.author, { color: t.text }]}>{authorName}</Text>
                <Text style={[styles.time, { color: t.textSecondary }]}>
                  {new Date(post.createdAt).toLocaleString()}
                </Text>
              </View>
            </View>
            <Text style={[styles.title, { color: t.text }]}>{post.title}</Text>
            <Text style={[styles.body, { color: t.text }]}>{post.body}</Text>
            <View style={{ height: 12 }} />
            <ReactionRow postId={postId} initialCount={post.reactionCount} />
          </GlassCard>

          <Text style={[styles.commentsHeader, { color: t.text }]}>
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </Text>

          {comments.length === 0 ? (
            <Text style={[styles.emptyComments, { color: t.textSecondary }]}>
              Be the first to reply. Share your perspective.
            </Text>
          ) : (
            comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                isReply={!!c.parentCommentId}
                onReply={() => setReplyingToCommentId(c.id)}
                onLongPress={() =>
                  showActions({ commentId: c.id, userId: c.userId })
                }
              />
            ))
          )}
        </ScrollView>

        {/* Composer */}
        <View style={[styles.composer, { backgroundColor: t.bg, borderTopColor: t.cardBorder }]}>
          {replyingToCommentId && (
            <View style={styles.replyContext}>
              <Text style={[styles.replyContextText, { color: t.textSecondary }]}>
                Replying to a comment
              </Text>
              <TouchableOpacity onPress={() => setReplyingToCommentId(null)} hitSlop={10}>
                <Ionicons name="close-circle" size={16} color={t.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.composerRow, { borderColor: t.cardBorder }]}>
            <TextInput
              value={commentDraft}
              onChangeText={setCommentDraft}
              placeholder={replyingToCommentId ? 'Reply…' : 'Add a comment'}
              placeholderTextColor={t.textSecondary}
              multiline
              style={[styles.composerInput, { color: t.text }]}
              maxLength={4000}
            />
            <TouchableOpacity
              onPress={submitComment}
              disabled={!commentDraft.trim() || submittingComment}
              accessibilityRole="button"
              accessibilityLabel="Post comment"
            >
              <Ionicons
                name="send"
                size={20}
                color={commentDraft.trim() && !submittingComment ? t.primary : t.textSecondary}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.composerFootRow}>
            <Switch
              value={commentAnonymous}
              onValueChange={setCommentAnonymous}
              trackColor={{ true: t.primary + '88', false: t.cardBorder }}
              thumbColor={commentAnonymous ? t.primary : '#fff'}
              style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
            />
            <Text style={[styles.composerFootText, { color: t.textSecondary }]}>
              Anonymous
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 24,
    gap: Spacing.sm,
  },
  postCard: { padding: Spacing.md, gap: 8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  author: { fontSize: FontSizes.sm, fontWeight: '700' },
  time: { fontSize: 11, marginTop: 2 },
  title: { fontSize: FontSizes.lg, fontWeight: '800', lineHeight: 24 },
  body: { fontSize: FontSizes.sm, lineHeight: 22 },
  commentsHeader: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    marginTop: Spacing.md,
    marginBottom: 4,
  },
  emptyComments: {
    fontSize: FontSizes.sm,
    fontStyle: 'italic',
    marginTop: 12,
  },
  composer: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 4 : 8,
  },
  replyContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  replyContextText: { fontSize: 11, fontStyle: 'italic' },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  composerInput: {
    flex: 1,
    fontSize: FontSizes.sm,
    paddingVertical: 6,
    maxHeight: 120,
  },
  composerFootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  composerFootText: { fontSize: 11 },
});
