/**
 * Community store — feed cache, post detail, comment threads, reactions.
 *
 * Reads route through Supabase RLS (free for everyone authed).
 * Writes route through edge functions which enforce tier + rate limits +
 * profanity filter + block-relationship checks.
 *
 * NOT persisted — community feed is intentionally stale-on-launch. Pull
 * fresh on every entry to /community to avoid showing deleted/moderated
 * content from a stale cache.
 */

import { create } from 'zustand';
import type {
  CommunityPost,
  CommunityComment,
  CommunityTopic,
  CommunityReactionKind,
  CommunityReportReason,
} from '../types/community';

interface CommunityState {
  topics: CommunityTopic[];
  posts: CommunityPost[];
  /** Full post + comment thread keyed by post id. Lazily hydrated when
   *  the user opens a post detail. */
  postDetails: Record<string, { post: CommunityPost; comments: CommunityComment[] }>;
  /** User-blocked ids — hides their content client-side without a
   *  server round-trip. */
  blockedUserIds: string[];
  /** Users this account follows. Hydrated once on community-screen
   *  mount, kept in sync by toggleFollow. */
  followedUserIds: string[];
  unreadNotificationCount: number;

  loadingFeed: boolean;
  loadingTopics: boolean;
  loadingDetail: Record<string, boolean>;
  /** Last hydrateFeed error message, surfaced in the UI so a network
   *  blip doesn't masquerade as an empty topic. Cleared at the start
   *  of every refresh. P1 from the 2026-05-17 loading/error audit. */
  feedError: string | null;
  /** Per-post detail fetch error keyed by postId. */
  detailError: Record<string, string | null>;

  // ── Reads ──
  hydrateTopics: () => Promise<void>;
  hydrateFeed: (opts?: { topicSlug?: string | null; sort?: 'new' | 'top_today' | 'top_week' | 'top_all'; followingOnly?: boolean }) => Promise<void>;
  /** Open a Realtime subscription on community_posts so new posts +
   *  count updates appear without manual refresh. Idempotent — safe
   *  to call from multiple mount points. */
  subscribeFeedRealtime: () => Promise<void>;
  /** Close the feed Realtime channel (e.g. on sign-out). */
  unsubscribeFeedRealtime: () => void;
  hydratePostDetail: (postId: string) => Promise<void>;
  hydrateBlockedUsers: () => Promise<void>;
  hydrateFollowedUsers: () => Promise<void>;
  hydrateUnreadCount: () => Promise<void>;

  // ── Writes ──
  createPost: (input: { topicSlug: string; title: string; body: string; isAnonymous: boolean; imageUrls?: string[] }) =>
    Promise<{ ok: true; postId: string } | { ok: false; error: string; needsUsername?: boolean; upgrade?: boolean }>;
  createComment: (input: { postId: string; parentCommentId?: string | null; body: string; isAnonymous: boolean; imageUrls?: string[] }) =>
    Promise<{ ok: true; commentId: string } | { ok: false; error: string; needsUsername?: boolean; upgrade?: boolean }>;
  editPost: (input: { postId: string; title?: string; body?: string; imageUrls?: string[] }) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  deletePost: (postId: string) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  editComment: (input: { commentId: string; body?: string; imageUrls?: string[] }) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  deleteComment: (commentId: string) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  toggleReaction: (target: { postId?: string; commentId?: string; kind: CommunityReactionKind }, presentlyReacted: boolean) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  /** Report a live-chat message — separate edge function from the
   *  post/comment reportContent because live messages are stored in a
   *  different table with a different lifecycle. */
  reportLiveMessage: (input: { messageId: string; reason: CommunityReportReason }) =>
    Promise<{ ok: boolean; error?: string }>;
  reportContent: (input: { postId?: string; commentId?: string; reason: CommunityReportReason; notes?: string }) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  blockUser: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  unblockUser: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  followUser: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  unfollowUser: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  setUsername: (input: { username: string; displayName?: string }) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  suggestTopic: (input: { name: string; description?: string }) =>
    Promise<{ ok: true; slug: string } | { ok: false; error: string }>;
  searchPosts: (q: string, topicSlug?: string | null) => Promise<CommunityPost[]>;

  markNotificationsRead: () => Promise<void>;
  clearAll: () => void;
}

const POST_AUTHOR_FIELDS = 'id, username, display_name, avatar_url';

async function getSupa() {
  const { supabase } = await import('../services/supabase');
  return supabase as any;
}

async function authedFetch<T>(fn: string, body: unknown): Promise<T> {
  const supabase = await getSupa();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');
  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    // supabase-js wraps function errors — try to read the body the function returned.
    //
    // 2026-05-17 P0 fix: the previous version did `await ctx.body` which
    // doesn't work — supabase-js v2's FunctionsHttpError.context is a
    // `Response`, and `body` is a ReadableStream that needs `.text()` to
    // resolve to a string. Body parsing was silently failing on every
    // 4xx, swallowing the function's real error message
    // ("Set a community handle first", "Post contains language not
    // allowed", etc.) and surfacing the generic
    // "Edge Function returned a non-2xx status code" instead. Jamie's
    // build-28 community-post failure traces back to here.
    try {
      const ctx: any = (error as any)?.context;
      // Response shape (current supabase-js v2)
      if (ctx && typeof ctx.text === 'function') {
        const text = await ctx.text();
        if (text) return JSON.parse(text) as T;
      }
      // Fallback for older shapes that embed { status, body } directly.
      if (ctx?.body && typeof ctx.body === 'string') {
        return JSON.parse(ctx.body) as T;
      }
      if (ctx?.body && typeof ctx.body.text === 'function') {
        const text = await ctx.body.text();
        if (text) return JSON.parse(text) as T;
      }
    } catch { /* ignore */ }
    throw error;
  }
  return data as T;
}

/** Fetch public-safe profile rows for a set of user ids. Replaces the
 *  PostgREST `profiles:user_id (...)` embed — the `profiles` table is
 *  self-only RLS, so the embed returned NULL for every author except
 *  the caller. Wave 76.11 added a `public_profiles` view that exposes
 *  only (id, username, display_name, avatar_url, created_at) and is
 *  readable by every authenticated user. We fetch from it manually
 *  and merge in memory. */
async function fetchAuthorMap(
  supabase: any,
  userIds: string[],
): Promise<Map<string, { id: string; username?: string; displayName?: string; avatarUrl?: string }>> {
  const out = new Map<string, { id: string; username?: string; displayName?: string; avatarUrl?: string }>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return out;
  try {
    const { data } = await supabase
      .from('public_profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', unique);
    if (Array.isArray(data)) {
      for (const r of data as any[]) {
        out.set(r.id, {
          id: r.id,
          username: r.username ?? undefined,
          displayName: r.display_name ?? undefined,
          avatarUrl: r.avatar_url ?? undefined,
        });
      }
    }
  } catch (err) {
    if (__DEV__) console.warn('[community] fetchAuthorMap failed:', err);
  }
  return out;
}

function rowToPost(
  r: any,
  authorMap?: Map<string, { id: string; username?: string; displayName?: string; avatarUrl?: string }>,
): CommunityPost {
  // Prefer the merged author map (from public_profiles); fall back to
  // the legacy `profiles` embed shape for any caller that still passes
  // raw rows (e.g. server-rendered initial fetches).
  const fromMap = authorMap?.get(r.user_id);
  const author = fromMap
    ?? (r.profiles
      ? {
          id: r.profiles.id ?? r.user_id,
          username: r.profiles.username ?? undefined,
          displayName: r.profiles.display_name ?? undefined,
          avatarUrl: r.profiles.avatar_url ?? undefined,
        }
      : undefined);
  return {
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
    lastEditedAt: r.last_edited_at ?? undefined,
    moderationStatus: r.moderation_status ?? undefined,
    imageUrls: Array.isArray(r.image_urls) ? r.image_urls : [],
    author,
  };
}

function rowToComment(
  r: any,
  authorMap?: Map<string, { id: string; username?: string; displayName?: string; avatarUrl?: string }>,
): CommunityComment {
  const fromMap = authorMap?.get(r.user_id);
  const author = fromMap
    ?? (r.profiles
      ? {
          id: r.profiles.id ?? r.user_id,
          username: r.profiles.username ?? undefined,
          displayName: r.profiles.display_name ?? undefined,
          avatarUrl: r.profiles.avatar_url ?? undefined,
        }
      : undefined);
  return {
    id: r.id,
    postId: r.post_id,
    userId: r.user_id,
    parentCommentId: r.parent_comment_id ?? undefined,
    body: r.body,
    isDeleted: !!r.is_deleted,
    reactionCount: r.reaction_count ?? 0,
    createdAt: r.created_at,
    lastEditedAt: r.last_edited_at ?? undefined,
    moderationStatus: r.moderation_status ?? undefined,
    imageUrls: Array.isArray(r.image_urls) ? r.image_urls : [],
    author,
  };
}

export const useCommunityStore = create<CommunityState>()((set, get) => ({
  topics: [],
  posts: [],
  postDetails: {},
  blockedUserIds: [],
  followedUserIds: [],
  unreadNotificationCount: 0,
  loadingFeed: false,
  loadingTopics: false,
  loadingDetail: {},
  feedError: null,
  detailError: {},

  hydrateTopics: async () => {
    set({ loadingTopics: true });
    try {
      const supabase = await getSupa();
      const { data, error } = await supabase
        .from('community_topics')
        .select('id, slug, name, description, icon, is_default, is_active, status, suggested_by, created_at')
        .eq('is_active', true)
        .eq('status', 'approved')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      const topics: CommunityTopic[] = (data ?? []).map((r: any) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description ?? undefined,
        icon: r.icon ?? undefined,
        isDefault: !!r.is_default,
        isActive: !!r.is_active,
        status: r.status,
        suggestedBy: r.suggested_by ?? undefined,
        createdAt: r.created_at,
      }));
      set({ topics });
    } catch (err) {
      if (__DEV__) console.warn('[community] hydrateTopics:', err);
    } finally {
      set({ loadingTopics: false });
    }
  },

  hydrateFeed: async (opts) => {
    set({ loadingFeed: true, feedError: null });
    try {
      const supabase = await getSupa();
      const sort = opts?.sort ?? 'new';
      const topicSlug = opts?.topicSlug ?? null;

      let q = supabase
        .from('community_posts')
        .select(`
          id, user_id, topic_slug, title, body, reaction_count, comment_count,
          is_deleted, is_anonymous, image_urls, last_edited_at, moderation_status, created_at, updated_at
        `)
        .eq('is_deleted', false);

      if (topicSlug) q = q.eq('topic_slug', topicSlug);

      if (opts?.followingOnly) {
        const followed = get().followedUserIds;
        if (followed.length === 0) {
          // No follows yet — return empty rather than the global feed.
          set({ posts: [] });
          return;
        }
        q = q.in('user_id', followed);
      }

      if (sort === 'new') {
        q = q.order('created_at', { ascending: false });
      } else {
        // top_today / top_week / top_all — sort by reactions, scoped by recency.
        const cutoff = sort === 'top_today'
          ? Date.now() - 24 * 3600 * 1000
          : sort === 'top_week'
          ? Date.now() - 7 * 24 * 3600 * 1000
          : null;
        if (cutoff != null) q = q.gte('created_at', new Date(cutoff).toISOString());
        q = q.order('reaction_count', { ascending: false }).order('created_at', { ascending: false });
      }

      const { data, error } = await q.limit(50);
      if (error) throw error;

      // Current user id — pending image posts are hidden from everyone
      // except their author (App Store 1.2: UGC images must not be
      // publicly visible before moderation approves them). RLS enforces
      // this server-side too; this is the client mirror so a stale realtime
      // patch can't leak a pending image into the feed.
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id ?? null;

      const blocked = new Set(get().blockedUserIds);
      const visibleRows = (data ?? []).filter((r: any) => {
        if (blocked.has(r.user_id)) return false;
        const hasImage = Array.isArray(r.image_urls) && r.image_urls.length > 0;
        if (hasImage && r.moderation_status === 'pending' && r.user_id !== currentUserId) {
          return false;
        }
        return true;
      });
      // Manual join against public_profiles since the base `profiles`
      // table is self-only RLS (PostgREST embed returned NULL for
      // every non-self author before Wave 76.11).
      const authorMap = await fetchAuthorMap(
        supabase,
        visibleRows
          .filter((r: any) => !r.is_anonymous)
          .map((r: any) => r.user_id),
      );
      const posts = visibleRows.map((r: any) => {
        const post = rowToPost(r, authorMap);
        if (r.is_anonymous) {
          post.author = {
            id: post.userId,
            displayName: 'Anonymous member',
          };
        }
        return post;
      });

      set({ posts });
    } catch (err) {
      if (__DEV__) console.warn('[community] hydrateFeed:', err);
      const msg = (err as any)?.message
        ?? 'Could not load the feed. Check your connection and try again.';
      set({ feedError: msg });
    } finally {
      set({ loadingFeed: false });
    }
  },

  hydratePostDetail: async (postId) => {
    set({
      loadingDetail: { ...get().loadingDetail, [postId]: true },
      detailError: { ...get().detailError, [postId]: null },
    });
    try {
      const supabase = await getSupa();

      const { data: postRow, error: postErr } = await supabase
        .from('community_posts')
        .select(`
          id, user_id, topic_slug, title, body, reaction_count, comment_count,
          is_deleted, is_anonymous, image_urls, last_edited_at, moderation_status, created_at, updated_at
        `)
        .eq('id', postId)
        .maybeSingle();
      if (postErr) throw postErr;

      // Current user id — a post with a pending image is only visible to
      // its author until moderation approves it (App Store 1.2). Mirror of
      // the RLS rule so a non-author who deep-links a pending post sees the
      // standard "removed" placeholder instead of the unmoderated image.
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id ?? null;
      const postHasImage = !!postRow
        && Array.isArray(postRow.image_urls) && postRow.image_urls.length > 0;
      const postPendingHidden = postHasImage
        && postRow.moderation_status === 'pending'
        && postRow.user_id !== currentUserId;

      if (!postRow || postRow.is_deleted || postPendingHidden) {
        set({
          postDetails: {
            ...get().postDetails,
            [postId]: {
              post: { id: postId, userId: '', topicSlug: '', title: '[Removed]', body: '', isDeleted: true, reactionCount: 0, commentCount: 0, createdAt: '', updatedAt: '' },
              comments: [],
            },
          },
        });
        return;
      }

      const { data: commentRows, error: commentsErr } = await supabase
        .from('community_comments')
        .select(`
          id, post_id, user_id, parent_comment_id, body, reaction_count,
          is_deleted, is_anonymous, image_urls, last_edited_at, moderation_status, created_at
        `)
        .eq('post_id', postId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });
      if (commentsErr) throw commentsErr;

      const blocked = new Set(get().blockedUserIds);

      // One author lookup for the post + all its comments. De-dupes
      // multiple comments from the same user.
      const allAuthorIds: string[] = [];
      if (!postRow.is_anonymous) allAuthorIds.push(postRow.user_id);
      for (const c of (commentRows ?? []) as any[]) {
        if (!c.is_anonymous && !blocked.has(c.user_id)) allAuthorIds.push(c.user_id);
      }
      const authorMap = await fetchAuthorMap(supabase, allAuthorIds);

      const post = rowToPost(postRow, authorMap);
      if (postRow.is_anonymous) {
        post.author = { id: post.userId, displayName: 'Anonymous member' };
      }

      const comments = (commentRows ?? [])
        .filter((r: any) => {
          if (blocked.has(r.user_id)) return false;
          // Same pending-image rule as posts: a comment carrying an
          // unmoderated image is visible only to its author until approved.
          const hasImage = Array.isArray(r.image_urls) && r.image_urls.length > 0;
          if (hasImage && r.moderation_status === 'pending' && r.user_id !== currentUserId) {
            return false;
          }
          return true;
        })
        .map((r: any) => {
          const c = rowToComment(r, authorMap);
          if (r.is_anonymous) {
            c.author = { id: c.userId, displayName: 'Anonymous member' };
          }
          return c;
        });

      set({
        postDetails: {
          ...get().postDetails,
          [postId]: { post, comments },
        },
      });
    } catch (err) {
      if (__DEV__) console.warn('[community] hydratePostDetail:', err);
      const msg = (err as any)?.message
        ?? 'Could not load this post. Pull to refresh or try again.';
      set({ detailError: { ...get().detailError, [postId]: msg } });
    } finally {
      set({ loadingDetail: { ...get().loadingDetail, [postId]: false } });
    }
  },

  hydrateBlockedUsers: async () => {
    try {
      const supabase = await getSupa();
      const { data, error } = await supabase
        .from('community_blocks').select('blocked_id');
      if (error) throw error;
      set({ blockedUserIds: (data ?? []).map((r: any) => r.blocked_id) });
    } catch (err) {
      if (__DEV__) console.warn('[community] hydrateBlockedUsers:', err);
    }
  },

  hydrateFollowedUsers: async () => {
    try {
      const supabase = await getSupa();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('community_follows')
        .select('followed_id')
        .eq('follower_id', user.id);
      if (error) throw error;
      set({ followedUserIds: (data ?? []).map((r: any) => r.followed_id) });
    } catch (err) {
      if (__DEV__) console.warn('[community] hydrateFollowedUsers:', err);
    }
  },

  hydrateUnreadCount: async () => {
    try {
      const supabase = await getSupa();
      const { count } = await supabase
        .from('community_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);
      set({ unreadNotificationCount: count ?? 0 });
    } catch {
      // silent
    }
  },

  createPost: async (input) => {
    try {
      const res = await authedFetch<any>('community-create-post', input);
      if (res?.error) {
        return {
          ok: false,
          error: res.error,
          needsUsername: !!res.needsUsername,
          upgrade: !!res.upgrade,
        };
      }
      // Refresh feed so the new post appears immediately.
      get().hydrateFeed().catch(() => {});
      return { ok: true, postId: res.postId };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed to post' };
    }
  },

  createComment: async (input) => {
    try {
      const res = await authedFetch<any>('community-create-comment', input);
      if (res?.error) {
        return {
          ok: false,
          error: res.error,
          needsUsername: !!res.needsUsername,
          upgrade: !!res.upgrade,
        };
      }
      get().hydratePostDetail(input.postId).catch(() => {});
      return { ok: true, commentId: res.commentId };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed to comment' };
    }
  },

  editPost: async (input) => {
    try {
      const res = await authedFetch<any>('community-edit-post', input);
      if (res?.error) return { ok: false, error: res.error };
      // Refresh detail + feed so the edit is reflected immediately.
      get().hydratePostDetail(input.postId).catch(() => {});
      get().hydrateFeed().catch(() => {});
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed to edit' };
    }
  },

  deletePost: async (postId) => {
    try {
      const res = await authedFetch<any>('community-delete-post', { postId });
      if (res?.error) return { ok: false, error: res.error };
      // Optimistic local remove — the soft-delete on the server means
      // hydrateFeed would also drop it on next pull, but updating here
      // makes the UX feel instant.
      set({ posts: get().posts.filter((p) => p.id !== postId) });
      const detail = get().postDetails[postId];
      if (detail) {
        const next = { ...get().postDetails };
        delete next[postId];
        set({ postDetails: next });
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed to delete' };
    }
  },

  editComment: async (input) => {
    try {
      const res = await authedFetch<any>('community-edit-comment', input);
      if (res?.error) return { ok: false, error: res.error };
      // Edit shows up the next time we re-hydrate the post detail —
      // find the parent post and re-hydrate it.
      const details = get().postDetails;
      for (const [postId, detail] of Object.entries(details)) {
        if (detail?.comments?.some((c) => c.id === input.commentId)) {
          get().hydratePostDetail(postId).catch(() => {});
          break;
        }
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed to edit comment' };
    }
  },

  deleteComment: async (commentId) => {
    try {
      const res = await authedFetch<any>('community-delete-comment', { commentId });
      if (res?.error) return { ok: false, error: res.error };
      // Re-hydrate whichever post owns this comment.
      const details = get().postDetails;
      for (const [postId, detail] of Object.entries(details)) {
        if (detail?.comments?.some((c) => c.id === commentId)) {
          get().hydratePostDetail(postId).catch(() => {});
          break;
        }
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed to delete comment' };
    }
  },

  toggleReaction: async (target, presentlyReacted) => {
    try {
      await authedFetch('community-react', {
        ...target,
        action: presentlyReacted ? 'remove' : 'add',
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed' };
    }
  },

  reportContent: async (input) => {
    try {
      const res = await authedFetch<any>('community-report', input);
      if (res?.error) return { ok: false, error: res.error };
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed' };
    }
  },

  reportLiveMessage: async (input) => {
    try {
      const res = await authedFetch<any>('community-live-report-message', input);
      if (res?.error) return { ok: false, error: res.error };
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed' };
    }
  },

  blockUser: async (userId) => {
    try {
      await authedFetch('community-block', { blockedId: userId, action: 'block' });
      set({ blockedUserIds: Array.from(new Set([...get().blockedUserIds, userId])) });
      // Drop their content from the visible feed in-place.
      set({ posts: get().posts.filter((p) => p.userId !== userId) });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed' };
    }
  },

  unblockUser: async (userId) => {
    try {
      await authedFetch('community-block', { blockedId: userId, action: 'unblock' });
      set({ blockedUserIds: get().blockedUserIds.filter((id) => id !== userId) });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed' };
    }
  },

  followUser: async (userId) => {
    try {
      await authedFetch('community-follow', { followedId: userId, action: 'follow' });
      set({ followedUserIds: Array.from(new Set([...get().followedUserIds, userId])) });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed' };
    }
  },

  unfollowUser: async (userId) => {
    try {
      await authedFetch('community-follow', { followedId: userId, action: 'unfollow' });
      set({ followedUserIds: get().followedUserIds.filter((id) => id !== userId) });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed' };
    }
  },

  setUsername: async (input) => {
    try {
      const res = await authedFetch<any>('community-set-username', input);
      if (res?.error) return { ok: false, error: res.error };
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed' };
    }
  },

  suggestTopic: async (input) => {
    try {
      const res = await authedFetch<any>('community-suggest-topic', input);
      if (res?.error) return { ok: false, error: res.error };
      return { ok: true, slug: res.slug };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Failed' };
    }
  },

  searchPosts: async (q, topicSlug) => {
    try {
      const res = await authedFetch<any>('community-search', { q, topicSlug });
      return (res?.posts ?? []).map((r: any) => rowToPost(r));
    } catch {
      return [];
    }
  },

  markNotificationsRead: async () => {
    try {
      const supabase = await getSupa();
      const { error } = await supabase
        .from('community_notifications')
        .update({ is_read: true })
        .eq('is_read', false);
      if (!error) set({ unreadNotificationCount: 0 });
    } catch {
      // silent
    }
  },

  subscribeFeedRealtime: async () => {
    const w = get() as any;
    if (w._feedChannel) return;  // already subscribed
    try {
      const supabase = await getSupa();
      const channel = supabase
        .channel('community-feed-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'community_posts' },
          () => {
            // New post landed somewhere — refresh the visible feed.
            // Cheap because hydrateFeed already de-dupes server-side.
            get().hydrateFeed().catch(() => {});
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'community_posts' },
          (payload: any) => {
            // Counter / soft-delete updates: patch the in-memory post so
            // the feed reaction/comment counts increment live without a
            // full hydrate.
            const r = payload?.new;
            if (!r?.id) return;
            const existing = get().posts.find((p) => p.id === r.id);
            if (!existing) return;
            const next = get().posts.map((p) =>
              p.id === r.id
                ? {
                    ...p,
                    reactionCount: r.reaction_count ?? p.reactionCount,
                    commentCount: r.comment_count ?? p.commentCount,
                    isDeleted: !!r.is_deleted,
                  }
                : p,
            );
            set({ posts: next });
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'community_comments' },
          (payload: any) => {
            // If we're viewing the parent post detail, append the new
            // comment to that thread without a hydrate.
            const r = payload?.new;
            if (!r?.post_id) return;
            const detail = get().postDetails[r.post_id];
            if (!detail) return;
            const exists = detail.comments?.some((c) => c.id === r.id);
            if (exists) return;
            // Best-effort hydrate of the single thread to pull the
            // joined profile data we'd otherwise miss.
            get().hydratePostDetail(r.post_id).catch(() => {});
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'community_comments' },
          (payload: any) => {
            // Comment edit / soft-delete / reaction-count update. Patch
            // the in-memory comment for the parent post detail thread so
            // viewers see edits + retractions without a refresh.
            const r = payload?.new;
            if (!r?.post_id || !r?.id) return;
            const detail = get().postDetails[r.post_id];
            if (!detail?.comments) return;
            const next = detail.comments.map((c) =>
              c.id === r.id
                ? {
                    ...c,
                    body: r.body ?? c.body,
                    isDeleted: !!r.is_deleted,
                    reactionCount: r.reaction_count ?? c.reactionCount,
                    lastEditedAt: r.last_edited_at ?? c.lastEditedAt,
                  }
                : c,
            );
            set({
              postDetails: {
                ...get().postDetails,
                [r.post_id]: { ...detail, comments: next },
              },
            });
          },
        )
        .subscribe();
      (get() as any)._feedChannel = channel;
    } catch (err) {
      if (__DEV__) console.warn('[community] realtime subscribe failed:', err);
    }
  },

  unsubscribeFeedRealtime: () => {
    const w = get() as any;
    if (w._feedChannel) {
      try { w._feedChannel.unsubscribe(); } catch {}
      w._feedChannel = null;
    }
  },

  clearAll: () => {
    get().unsubscribeFeedRealtime();
    set({
      topics: [],
      posts: [],
      postDetails: {},
      blockedUserIds: [],
      followedUserIds: [],
      unreadNotificationCount: 0,
    });
  },
}));
