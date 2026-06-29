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
  /** True while loadMoreFeed is fetching the next page. Separate from
   *  loadingFeed so the initial spinner and the bottom "loading more"
   *  spinner don't fight each other. */
  loadingMore: boolean;
  /** Whether the last feed page came back full — i.e. there may be more
   *  to fetch. Flipped false once a short page lands. P2.19. */
  feedHasMore: boolean;
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
  /** Fetch the next page of the feed using the same query + sort as the
   *  last hydrateFeed, APPENDING to posts. No-op while a fetch is in
   *  flight or when feedHasMore is false. P2.19 — fixes the 50-post
   *  ceiling where the feed had no onEndReached/cursor. */
  loadMoreFeed: () => Promise<void>;
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

/** Feed page size. Doubles as the initial hydrateFeed limit AND the
 *  loadMoreFeed page size so "is this page full?" maps cleanly to
 *  feedHasMore. P2.19. */
const FEED_PAGE_SIZE = 30;

/** Columns the feed/detail reads pull. Selected from the privacy views
 *  (community_posts_feed / community_comments_feed) rather than the base
 *  tables so anonymous rows arrive with user_id already masked to NULL
 *  for everyone but the author. See migration 20260628000003. */
const FEED_POST_COLUMNS = `
  id, user_id, topic_slug, title, body, reaction_count, comment_count,
  is_deleted, is_anonymous, image_urls, last_edited_at, moderation_status, created_at, updated_at
`;

type FeedOpts = { topicSlug?: string | null; sort?: 'new' | 'top_today' | 'top_week' | 'top_all'; followingOnly?: boolean };

/** Build the feed SELECT query (filters + ordering) shared by the
 *  initial hydrate and pagination. Does NOT apply the row limit/range —
 *  the caller adds that so the same builder serves both the first page
 *  (.limit) and subsequent keyset/range pages. */
function buildFeedQuery(supabase: any, opts: FeedOpts, followedUserIds: string[]) {
  const sort = opts.sort ?? 'new';
  const topicSlug = opts.topicSlug ?? null;

  let q = supabase
    .from('community_posts_feed')
    .select(FEED_POST_COLUMNS)
    .eq('is_deleted', false);

  if (topicSlug) q = q.eq('topic_slug', topicSlug);
  if (opts.followingOnly) q = q.in('user_id', followedUserIds);

  if (sort === 'new') {
    q = q.order('created_at', { ascending: false });
  } else {
    const cutoff = sort === 'top_today'
      ? Date.now() - 24 * 3600 * 1000
      : sort === 'top_week'
      ? Date.now() - 7 * 24 * 3600 * 1000
      : null;
    if (cutoff != null) q = q.gte('created_at', new Date(cutoff).toISOString());
    q = q.order('reaction_count', { ascending: false }).order('created_at', { ascending: false });
  }
  return q;
}

/** Apply the feed visibility filters (blocked authors + pending-image
 *  author-only rule) and resolve author cards. Shared by hydrateFeed +
 *  loadMoreFeed so both pages get identical treatment. */
async function buildVisiblePosts(
  supabase: any,
  rows: any[],
  blocked: Set<string>,
  currentUserId: string | null,
): Promise<CommunityPost[]> {
  const visibleRows = (rows ?? []).filter((r: any) => {
    if (blocked.has(r.user_id)) return false;
    const hasImage = Array.isArray(r.image_urls) && r.image_urls.length > 0;
    if (hasImage && r.moderation_status === 'pending' && r.user_id !== currentUserId) {
      return false;
    }
    return true;
  });
  const authorMap = await fetchAuthorMap(
    supabase,
    visibleRows.filter((r: any) => !r.is_anonymous).map((r: any) => r.user_id),
  );
  return visibleRows.map((r: any) => {
    const post = rowToPost(r, authorMap);
    if (r.is_anonymous) {
      post.author = { id: post.userId, displayName: 'Anonymous member' };
    }
    return post;
  });
}

/** Realtime INSERT/UPDATE payloads come from the BASE tables (Postgres
 *  can't publish changes through a view), so they still carry the true
 *  author id on is_anonymous rows even though the REST reads now mask it.
 *  Scrub the payload row in place before anything downstream consumes it.
 *  Defense-in-depth: the current handlers re-hydrate through the masked
 *  views, but this guards any future code that reads payload.new.user_id. */
function scrubAnonAuthor(r: any, currentUserId: string | null) {
  if (r && r.is_anonymous && r.user_id && r.user_id !== currentUserId) {
    r.user_id = null;
  }
}

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
  loadingMore: false,
  feedHasMore: false,
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
    const feedOpts: FeedOpts = {
      topicSlug: opts?.topicSlug ?? null,
      sort: opts?.sort ?? 'new',
      followingOnly: !!opts?.followingOnly,
    };
    // Stash the active query so loadMoreFeed can replay it for the next
    // page, and reset pagination state for the fresh load.
    (get() as any)._feedOpts = feedOpts;
    set({ loadingFeed: true, feedError: null, feedHasMore: false });
    try {
      const supabase = await getSupa();

      if (feedOpts.followingOnly) {
        const followed = get().followedUserIds;
        if (followed.length === 0) {
          // No follows yet — return empty rather than the global feed.
          set({ posts: [], feedHasMore: false });
          return;
        }
      }

      const q = buildFeedQuery(supabase, feedOpts, get().followedUserIds);
      const { data, error } = await q.limit(FEED_PAGE_SIZE);
      if (error) throw error;

      // Current user id — pending image posts are hidden from everyone
      // except their author (App Store 1.2: UGC images must not be
      // publicly visible before moderation approves them). RLS enforces
      // this server-side too; this is the client mirror so a stale realtime
      // patch can't leak a pending image into the feed. Also cached for
      // the realtime INSERT handler's anon-author scrub.
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id ?? null;
      (get() as any)._currentUserId = currentUserId;

      const blocked = new Set(get().blockedUserIds);
      const rawRows = (data ?? []) as any[];
      const posts = await buildVisiblePosts(supabase, rawRows, blocked, currentUserId);

      // A full page back ⟹ there may be more. Note feedHasMore tracks the
      // RAW row count, not the post-filter count, so blocked/pending rows
      // dropping below the page size doesn't falsely end pagination.
      set({ posts, feedHasMore: rawRows.length === FEED_PAGE_SIZE });
    } catch (err) {
      if (__DEV__) console.warn('[community] hydrateFeed:', err);
      const msg = (err as any)?.message
        ?? 'Could not load the feed. Check your connection and try again.';
      set({ feedError: msg });
    } finally {
      set({ loadingFeed: false });
    }
  },

  loadMoreFeed: async () => {
    const state = get();
    // Guard against duplicate / pointless fetches.
    if (state.loadingFeed || state.loadingMore || !state.feedHasMore) return;
    const posts = state.posts;
    if (posts.length === 0) return;
    const feedOpts: FeedOpts = (get() as any)._feedOpts ?? { topicSlug: null, sort: 'new', followingOnly: false };

    if (feedOpts.followingOnly && get().followedUserIds.length === 0) {
      set({ feedHasMore: false });
      return;
    }

    set({ loadingMore: true });
    try {
      const supabase = await getSupa();
      const sort = feedOpts.sort ?? 'new';
      let q = buildFeedQuery(supabase, feedOpts, get().followedUserIds);

      if (sort === 'new') {
        // Keyset cursor: created_at of the last loaded post. Stable +
        // index-backed (idx_community_posts_feed). Identical-timestamp
        // collisions are a negligible risk at microsecond precision;
        // worst case one row is skipped between pages.
        const cursor = posts[posts.length - 1]?.createdAt;
        if (!cursor) { set({ feedHasMore: false }); return; }
        q = q.lt('created_at', cursor).limit(FEED_PAGE_SIZE);
      } else {
        // top_* sorts order by reaction_count then created_at — a single
        // created_at cursor can't express that, so page these by offset.
        // Uses the count already loaded as the window start.
        const from = posts.length;
        q = q.range(from, from + FEED_PAGE_SIZE - 1);
      }

      const { data, error } = await q;
      if (error) throw error;

      const currentUserId = (get() as any)._currentUserId ?? null;
      const blocked = new Set(get().blockedUserIds);
      const rawRows = (data ?? []) as any[];
      const morePosts = await buildVisiblePosts(supabase, rawRows, blocked, currentUserId);

      // De-dupe against what's already loaded (defensive — realtime or a
      // timestamp collision could otherwise double-insert a row).
      const existingIds = new Set(get().posts.map((p) => p.id));
      const appended = morePosts.filter((p) => !existingIds.has(p.id));

      set({
        posts: [...get().posts, ...appended],
        feedHasMore: rawRows.length === FEED_PAGE_SIZE,
      });
    } catch (err) {
      if (__DEV__) console.warn('[community] loadMoreFeed:', err);
      // Don't surface a blocking error for pagination — leave the feed as
      // is so the user keeps what they have. Allow a retry on next scroll.
    } finally {
      set({ loadingMore: false });
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
        .from('community_posts_feed')
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
        .from('community_comments_feed')
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
          (payload: any) => {
            // Payload is from the base table — scrub the anon author id
            // before re-hydrating (defense-in-depth; the hydrate itself
            // reads the masked view).
            scrubAnonAuthor(payload?.new, (get() as any)._currentUserId ?? null);
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
            // Base-table payload — scrub anon author id before any read.
            scrubAnonAuthor(payload?.new, (get() as any)._currentUserId ?? null);
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
