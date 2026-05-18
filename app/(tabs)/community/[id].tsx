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
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../../src/components/GlassCard';
import { useTheme } from '../../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../../src/constants/theme';
import { useCommunityStore } from '../../../src/store/useCommunityStore';
import { useAuthStore } from '../../../src/store/useAuthStore';
import { ReactionRow } from '../../../src/components/community/ReactionRow';
import { CommentItem } from '../../../src/components/community/CommentItem';
import { MentionText } from '../../../src/components/community/MentionText';
import {
  REPORT_REASON_LABELS,
  type CommunityReportReason,
} from '../../../src/types/community';

export default function PostDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id ?? '');

  const detail = useCommunityStore((s) => s.postDetails[postId]);
  const loading = useCommunityStore((s) => !!s.loadingDetail[postId]);
  const detailError = useCommunityStore((s) => s.detailError[postId] ?? null);
  const hydrate = useCommunityStore((s) => s.hydratePostDetail);
  const createComment = useCommunityStore((s) => s.createComment);
  const reportContent = useCommunityStore((s) => s.reportContent);
  const blockUser = useCommunityStore((s) => s.blockUser);
  const editPost = useCommunityStore((s) => s.editPost);
  const deletePost = useCommunityStore((s) => s.deletePost);
  const editComment = useCommunityStore((s) => s.editComment);
  const deleteComment = useCommunityStore((s) => s.deleteComment);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [commentDraft, setCommentDraft] = useState('');
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [commentAnonymous, setCommentAnonymous] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [editPostTitle, setEditPostTitle] = useState('');
  const [editPostBody, setEditPostBody] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');

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

  const beginEditPost = () => {
    if (!post) return;
    setEditPostTitle(post.title);
    setEditPostBody(post.body);
    setEditingPost(true);
  };

  const beginEditComment = (commentId: string) => {
    const c = comments.find((x) => x.id === commentId);
    if (!c) return;
    setEditingCommentId(commentId);
    setEditCommentBody(c.body);
  };

  const confirmDeletePost = () => {
    Alert.alert('Delete post?', 'This will hide your post from the feed. This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await deletePost(postId);
          if (!res.ok) Alert.alert('Delete failed', res.error);
          else router.back();
        },
      },
    ]);
  };

  const confirmDeleteComment = (commentId: string) => {
    Alert.alert('Delete comment?', 'This will hide your comment. This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteComment(commentId);
          if (!res.ok) Alert.alert('Delete failed', res.error);
        },
      },
    ]);
  };

  const showActions = (target: { postId?: string; commentId?: string; userId: string }) => {
    const isOwn = !!currentUserId && target.userId === currentUserId;
    const buttons: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [];

    if (isOwn) {
      buttons.push({
        text: 'Edit',
        onPress: () => {
          if (target.postId) beginEditPost();
          else if (target.commentId) beginEditComment(target.commentId);
        },
      });
      buttons.push({
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (target.postId) confirmDeletePost();
          else if (target.commentId) confirmDeleteComment(target.commentId);
        },
      });
    } else {
      buttons.push({
        text: 'Report',
        onPress: () => promptReport(target),
      });
      buttons.push({
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
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Actions', 'What would you like to do?', buttons);
  };

  const submitEditPost = async () => {
    if (!editPostTitle.trim() || !editPostBody.trim()) {
      Alert.alert('Missing fields', 'Title and body cannot be empty.');
      return;
    }
    const res = await editPost({
      postId,
      title: editPostTitle.trim(),
      body: editPostBody.trim(),
    });
    if (!res.ok) {
      Alert.alert('Edit failed', res.error);
      return;
    }
    setEditingPost(false);
  };

  const submitEditComment = async () => {
    if (!editingCommentId) return;
    if (!editCommentBody.trim()) {
      Alert.alert('Empty comment', 'Comment cannot be empty.');
      return;
    }
    const res = await editComment({
      commentId: editingCommentId,
      body: editCommentBody.trim(),
    });
    if (!res.ok) {
      Alert.alert('Edit failed', res.error);
      return;
    }
    setEditingCommentId(null);
    setEditCommentBody('');
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

  // Error state — previously the loading spinner stuck forever when
  // the post fetch failed because `post` stayed null. Now show a
  // retry CTA + a way back.
  if (detailError && !post) {
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
          <Ionicons name="cloud-offline-outline" size={32} color={t.textSecondary} />
          <Text style={{ color: t.text, fontWeight: '700', marginTop: 12 }}>Couldn't load this post</Text>
          <Text style={{ color: t.textSecondary, marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
            {detailError}
          </Text>
          <TouchableOpacity
            onPress={() => hydrate(postId)}
            style={{
              marginTop: 18,
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: t.primary,
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading post"
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Try again</Text>
          </TouchableOpacity>
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
            <MentionText body={post.body} style={{ color: t.text, fontSize: FontSizes.sm, lineHeight: 22 }} />
            {post.lastEditedAt && (
              <Text style={[styles.editedTag, { color: t.textSecondary }]}>
                edited {new Date(post.lastEditedAt).toLocaleString()}
              </Text>
            )}
            {post.moderationStatus === 'pending' && currentUserId === post.userId && (
              <View style={styles.modPendingBadge}>
                <Ionicons name="hourglass-outline" size={12} color="#9b6cd9" />
                <Text style={styles.modPendingText}>
                  Image review pending — visible to others once approved
                </Text>
              </View>
            )}
            {post.imageUrls && post.imageUrls.length > 0 && (
              <View style={styles.postImagesRow}>
                {post.imageUrls.map((url) => (
                  <Image
                    key={url}
                    source={{ uri: url }}
                    style={styles.postImage}
                    resizeMode="cover"
                  />
                ))}
              </View>
            )}
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

      {/* Edit-post modal — opens from "Actions → Edit" on the user's own post. */}
      {editingPost && (
        <View style={styles.editModalOverlay}>
          <View style={[styles.editModalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.editModalTitle, { color: t.text }]}>Edit post</Text>
            <TextInput
              value={editPostTitle}
              onChangeText={setEditPostTitle}
              placeholder="Title"
              placeholderTextColor={t.textSecondary}
              style={[styles.editModalInput, { backgroundColor: t.glass, color: t.text }]}
              maxLength={140}
            />
            <TextInput
              value={editPostBody}
              onChangeText={setEditPostBody}
              placeholder="Body"
              placeholderTextColor={t.textSecondary}
              multiline
              style={[styles.editModalInput, { backgroundColor: t.glass, color: t.text, minHeight: 140, textAlignVertical: 'top' }]}
              maxLength={8000}
            />
            <View style={styles.editModalButtons}>
              <TouchableOpacity
                style={[styles.editModalBtn, { backgroundColor: t.glass }]}
                onPress={() => setEditingPost(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
              >
                <Text style={[styles.editModalBtnText, { color: t.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editModalBtn, { backgroundColor: t.primary }]}
                onPress={submitEditPost}
                accessibilityRole="button"
                accessibilityLabel="Save edits"
              >
                <Text style={[styles.editModalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Edit-comment modal */}
      {editingCommentId && (
        <View style={styles.editModalOverlay}>
          <View style={[styles.editModalCard, { backgroundColor: t.card }]}>
            <Text style={[styles.editModalTitle, { color: t.text }]}>Edit comment</Text>
            <TextInput
              value={editCommentBody}
              onChangeText={setEditCommentBody}
              placeholder="Comment"
              placeholderTextColor={t.textSecondary}
              multiline
              style={[styles.editModalInput, { backgroundColor: t.glass, color: t.text, minHeight: 120, textAlignVertical: 'top' }]}
              maxLength={4000}
            />
            <View style={styles.editModalButtons}>
              <TouchableOpacity
                style={[styles.editModalBtn, { backgroundColor: t.glass }]}
                onPress={() => {
                  setEditingCommentId(null);
                  setEditCommentBody('');
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel comment edit"
              >
                <Text style={[styles.editModalBtnText, { color: t.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editModalBtn, { backgroundColor: t.primary }]}
                onPress={submitEditComment}
                accessibilityRole="button"
                accessibilityLabel="Save comment edits"
              >
                <Text style={[styles.editModalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  editedTag: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 6,
  },
  modPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(155,108,217,0.10)',
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  modPendingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9b6cd9',
  },
  editModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  editModalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    gap: 10,
  },
  editModalTitle: {
    fontSize: FontSizes.md,
    fontWeight: '800',
  },
  editModalInput: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.sm,
  },
  editModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  editModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  editModalBtnText: { fontSize: FontSizes.sm, fontWeight: '700' },
  postImagesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  postImage: {
    width: (Dimensions.get('window').width - Spacing.md * 2 - Spacing.lg * 2 - 6) / 2,
    aspectRatio: 1,
    borderRadius: 10,
  },
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
