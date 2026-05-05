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

  // ── Reads ──
  hydrateTopics: () => Promise<void>;
  hydrateFeed: (opts?: { topicSlug?: string | null; sort?: 'new' | 'top_today' | 'top_week' | 'top_all'; followingOnly?: boolean }) => Promise<void>;
  hydratePostDetail: (postId: string) => Promise<void>;
  hydrateBlockedUsers: () => Promise<void>;
  hydrateFollowedUsers: () => Promise<void>;
  hydrateUnreadCount: () => Promise<void>;

  // ── Writes ──
  createPost: (input: { topicSlug: string; title: string; body: string; isAnonymous: boolean; imageUrls?: string[] }) =>
    Promise<{ ok: true; postId: string } | { ok: false; error: string; needsUsername?: boolean; upgrade?: boolean }>;
  createComment: (input: { postId: string; parentCommentId?: string | null; body: string; isAnonymous: boolean; imageUrls?: string[] }) =>
    Promise<{ ok: true; commentId: string } | { ok: false; error: string; needsUsername?: boolean; upgrade?: boolean }>;
  toggleReaction: (target: { postId?: string; commentId?: string; kind: CommunityReactionKind }, presentlyReacted: boolean) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
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
    try {
      const ctx = (error as any)?.context;
      const text = ctx?.body ? await ctx.body : null;
      const parsed = text ? JSON.parse(text) : null;
      if (parsed) return parsed as T;
    } catch { /* ignore */ }
    throw error;
  }
  return data as T;
}

function rowToPost(r: any): CommunityPost {
  const author = r.profiles
    ? {
        id: r.profiles.id ?? r.user_id,
        username: r.profiles.username ?? undefined,
        displayName: r.profiles.display_name ?? undefined,
        avatarUrl: r.profiles.avatar_url ?? undefined,
      }
    : undefined;
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
    imageUrls: Array.isArray(r.image_urls) ? r.image_urls : [],
    author,
  };
}

function rowToComment(r: any): CommunityComment {
  const author = r.profiles
    ? {
        id: r.profiles.id ?? r.user_id,
        username: r.profiles.username ?? undefined,
        displayName: r.profiles.display_name ?? undefined,
        avatarUrl: r.profiles.avatar_url ?? undefined,
      }
    : undefined;
  return {
    id: r.id,
    postId: r.post_id,
    userId: r.user_id,
    parentCommentId: r.parent_comment_id ?? undefined,
    body: r.body,
    isDeleted: !!r.is_deleted,
    reactionCount: r.reaction_count ?? 0,
    createdAt: r.created_at,
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
    set({ loadingFeed: true });
    try {
      const supabase = await getSupa();
      const sort = opts?.sort ?? 'new';
      const topicSlug = opts?.topicSlug ?? null;

      let q = supabase
        .from('community_posts')
        .select(`
          id, user_id, topic_slug, title, body, reaction_count, comment_count,
          is_deleted, is_anonymous, image_urls, created_at, updated_at,
          profiles:user_id ( id, username, display_name, avatar_url )
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

      const blocked = new Set(get().blockedUserIds);
      const posts = (data ?? [])
        .filter((r: any) => !blocked.has(r.user_id))
        .map((r: any) => {
          const post = rowToPost(r);
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
    } finally {
      set({ loadingFeed: false });
    }
  },

  hydratePostDetail: async (postId) => {
    set({ loadingDetail: { ...get().loadingDetail, [postId]: true } });
    try {
      const supabase = await getSupa();

      const { data: postRow, error: postErr } = await supabase
        .from('community_posts')
        .select(`
          id, user_id, topic_slug, title, body, reaction_count, comment_count,
          is_deleted, is_anonymous, image_urls, created_at, updated_at,
          profiles:user_id ( id, username, display_name, avatar_url )
        `)
        .eq('id', postId)
        .maybeSingle();
      if (postErr) throw postErr;
      if (!postRow || postRow.is_deleted) {
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
          is_deleted, is_anonymous, image_urls, created_at,
          profiles:user_id ( id, username, display_name, avatar_url )
        `)
        .eq('post_id', postId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });
      if (commentsErr) throw commentsErr;

      const blocked = new Set(get().blockedUserIds);

      const post = rowToPost(postRow);
      if (postRow.is_anonymous) {
        post.author = { id: post.userId, displayName: 'Anonymous member' };
      }

      const comments = (commentRows ?? [])
        .filter((r: any) => !blocked.has(r.user_id))
        .map((r: any) => {
          const c = rowToComment(r);
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

  clearAll: () => set({
    topics: [],
    posts: [],
    postDetails: {},
    blockedUserIds: [],
    followedUserIds: [],
    unreadNotificationCount: 0,
  }),
}));
