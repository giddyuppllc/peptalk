/**
 * useLiveEventStore — tracks the currently active (status='live')
 * community event + its messages, kept in sync with the server via
 * Supabase Realtime channels.
 *
 * Lifecycle:
 *   - On app foreground / community section mount → call hydrateActive()
 *     which queries the most recent live event
 *   - subscribe() opens a Realtime channel for events + messages of the
 *     current event (if any)
 *   - On status='ended' the active event clears; new live events flip in
 *     automatically via the events channel
 *
 * Not persisted — always re-hydrated from server. Keeps the source of
 * truth simple.
 */

import { create } from 'zustand';

export interface LiveEvent {
  id: string;
  hostUserId: string;
  title: string;
  description: string | null;
  status: 'scheduled' | 'live' | 'ended';
  startedAt: string | null;
  endedAt: string | null;
  requiredTier: 'free' | 'plus' | 'pro';
  hostName?: string;
}

export interface LiveMessage {
  id: string;
  eventId: string;
  userId: string;
  body: string;
  isHost: boolean;
  isDeleted?: boolean;
  lastEditedAt?: string | null;
  createdAt: string;
  authorName?: string;
}

interface LiveEventState {
  active: LiveEvent | null;
  messages: LiveMessage[];
  hydrating: boolean;
  /** Active Supabase Realtime channel, if any. */
  channel: any | null;

  hydrateActive: () => Promise<void>;
  /**
   * Hydrate a specific event by id regardless of status (live OR ended).
   * Used by the chat screen so deep-links / list-taps to an ended event
   * resolve instead of spinning forever waiting on the currently-live one.
   */
  hydrateEvent: (eventId: string) => Promise<void>;
  subscribeToEvent: (eventId: string) => Promise<void>;
  unsubscribe: () => void;
  pushLocalMessage: (msg: LiveMessage) => void;
  /** Clear everything (used on sign-out). */
  reset: () => void;
}

/**
 * Author-identity cache, keyed by user id. Mirrors the community feed's
 * `public_profiles` lookup (useCommunityStore.fetchAuthorMap): the base
 * `profiles` table is self-only RLS, so a PostgREST `profiles:user_id`
 * embed returns NULL for every author except the caller — which made
 * every host + participant render as "Member". We resolve names from the
 * authenticated-readable `public_profiles` table instead.
 *
 * Persisted at module scope so realtime INSERTs can show the right name
 * for already-seen authors without an extra round-trip.
 */
const authorCache = new Map<string, { username?: string; displayName?: string }>();

function displayNameFor(userId: string | null | undefined): string | undefined {
  if (!userId) return undefined;
  const a = authorCache.get(userId);
  if (!a) return undefined;
  return a.displayName?.trim() || a.username?.trim() || undefined;
}

/**
 * Batch-fetch public-safe profile rows for a set of user ids into
 * authorCache. Mirrors useCommunityStore.fetchAuthorMap precisely —
 * reads `id, username, display_name, avatar_url` from `public_profiles`,
 * de-dupes, and uses a single `.in('id', ids)` query. Ids already in the
 * cache are skipped so realtime inserts stay cheap.
 */
async function loadAuthors(
  supabase: any,
  userIds: (string | null | undefined)[],
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean) as string[]))
    .filter((id) => !authorCache.has(id));
  if (unique.length === 0) return;
  try {
    const { data } = await supabase
      .from('public_profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', unique);
    if (Array.isArray(data)) {
      for (const r of data as any[]) {
        authorCache.set(r.id, {
          username: r.username ?? undefined,
          displayName: r.display_name ?? undefined,
        });
      }
    }
  } catch (err) {
    if (__DEV__) console.warn('[live-event] loadAuthors failed:', err);
  }
}

function rowToEvent(r: any): LiveEvent {
  return {
    id: r.id,
    hostUserId: r.host_user_id,
    title: r.title,
    description: r.description ?? null,
    status: r.status,
    startedAt: r.started_at ?? null,
    endedAt: r.ended_at ?? null,
    requiredTier: r.required_tier ?? 'plus',
    hostName: displayNameFor(r.host_user_id),
  };
}

function rowToMessage(r: any): LiveMessage {
  return {
    id: r.id,
    eventId: r.event_id,
    userId: r.user_id,
    body: r.body,
    isHost: !!r.is_host,
    isDeleted: !!r.is_deleted,
    lastEditedAt: r.last_edited_at ?? null,
    createdAt: r.created_at,
    authorName: displayNameFor(r.user_id),
  };
}

export const useLiveEventStore = create<LiveEventState>((set, get) => ({
  active: null,
  messages: [],
  hydrating: false,
  channel: null,

  hydrateActive: async () => {
    if (get().hydrating) return;
    set({ hydrating: true });
    try {
      const { supabase } = await import('../services/supabase');
      const { data: row } = await (supabase as any)
        .from('community_live_events')
        .select(`
          id, host_user_id, title, description, status,
          started_at, ended_at, required_tier
        `)
        .eq('status', 'live')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row) {
        set({ active: null, messages: [] });
        return;
      }
      // Resolve the host's name from public_profiles before mapping the
      // row (the self-only `profiles` table can't be embedded).
      await loadAuthors(supabase, [row.host_user_id]);
      const event = rowToEvent(row);
      set({ active: event });

      // Pull last 200 messages for the event so users see context when
      // they join late.
      const { data: msgs } = await (supabase as any)
        .from('community_live_messages')
        .select(`
          id, event_id, user_id, body, is_host, is_deleted, last_edited_at, created_at
        `)
        .eq('event_id', event.id)
        .order('created_at', { ascending: true })
        .limit(200);
      // Batch-resolve every author from public_profiles, then map.
      await loadAuthors(supabase, (msgs ?? []).map((m: any) => m.user_id));
      set({ messages: (msgs ?? []).map(rowToMessage) });
    } catch (err) {
      if (__DEV__) console.warn('[live-event] hydrate failed:', err);
    } finally {
      set({ hydrating: false });
    }
  },

  hydrateEvent: async (eventId: string) => {
    if (!eventId) return;
    if (get().hydrating) return;
    set({ hydrating: true });
    try {
      const { supabase } = await import('../services/supabase');
      const { data: row } = await (supabase as any)
        .from('community_live_events')
        .select(`
          id, host_user_id, title, description, status,
          started_at, ended_at, required_tier
        `)
        .eq('id', eventId)
        .maybeSingle();
      if (!row) {
        // Don't clobber a different active event we may already be showing.
        if (get().active?.id === eventId) set({ active: null, messages: [] });
        return;
      }
      // Resolve the host's name from public_profiles before mapping the
      // row (the self-only `profiles` table can't be embedded).
      await loadAuthors(supabase, [row.host_user_id]);
      const event = rowToEvent(row);
      set({ active: event });

      // Pull last 200 messages for the event so users see context (works
      // for ended events too — the transcript stays viewable).
      const { data: msgs } = await (supabase as any)
        .from('community_live_messages')
        .select(`
          id, event_id, user_id, body, is_host, is_deleted, last_edited_at, created_at
        `)
        .eq('event_id', event.id)
        .order('created_at', { ascending: true })
        .limit(200);
      // Batch-resolve every author from public_profiles, then map.
      await loadAuthors(supabase, (msgs ?? []).map((m: any) => m.user_id));
      set({ messages: (msgs ?? []).map(rowToMessage) });
    } catch (err) {
      if (__DEV__) console.warn('[live-event] hydrateEvent failed:', err);
    } finally {
      set({ hydrating: false });
    }
  },

  subscribeToEvent: async (eventId: string) => {
    // Tear down any previous channel first.
    get().unsubscribe();
    try {
      const { supabase } = await import('../services/supabase');
      const channel = (supabase as any)
        .channel(`live-event-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'community_live_messages',
            filter: `event_id=eq.${eventId}`,
          },
          async (payload: any) => {
            const r = payload.new;
            if (get().messages.some((m) => m.id === r.id)) return;
            // Resolve the author from public_profiles (cached) so the new
            // message shows the right name instead of "Member".
            await loadAuthors(supabase, [r.user_id]);
            const msg = rowToMessage(r);
            if (get().messages.some((m) => m.id === msg.id)) return;
            set({ messages: [...get().messages, msg] });
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'community_live_messages',
            filter: `event_id=eq.${eventId}`,
          },
          (payload: any) => {
            const updated = rowToMessage(payload.new);
            set({
              messages: get().messages.map((m) =>
                m.id === updated.id
                  ? {
                      ...m,
                      body: updated.body,
                      isDeleted: updated.isDeleted,
                      lastEditedAt: updated.lastEditedAt,
                    }
                  : m,
              ),
            });
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'community_live_events',
            filter: `id=eq.${eventId}`,
          },
          (payload: any) => {
            const row = payload.new;
            const current = get().active;
            if (!current || current.id !== row.id) return;
            const next: LiveEvent = {
              ...current,
              status: row.status,
              endedAt: row.ended_at ?? current.endedAt,
            };
            set({ active: next });
          },
        )
        .subscribe();
      set({ channel });
    } catch (err) {
      if (__DEV__) console.warn('[live-event] subscribe failed:', err);
    }
  },

  unsubscribe: () => {
    const { channel } = get();
    if (channel) {
      try { channel.unsubscribe(); } catch {}
    }
    set({ channel: null });
  },

  pushLocalMessage: (msg: LiveMessage) => {
    if (get().messages.some((m) => m.id === msg.id)) return;
    set({ messages: [...get().messages, msg] });
  },

  reset: () => {
    get().unsubscribe();
    set({ active: null, messages: [], hydrating: false });
  },
}));
