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
  subscribeToEvent: (eventId: string) => Promise<void>;
  unsubscribe: () => void;
  pushLocalMessage: (msg: LiveMessage) => void;
  /** Clear everything (used on sign-out). */
  reset: () => void;
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
    hostName: r.profiles?.display_name?.trim() || r.profiles?.username?.trim() || undefined,
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
    authorName: r.profiles?.display_name?.trim() || r.profiles?.username?.trim() || undefined,
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
          started_at, ended_at, required_tier,
          profiles:host_user_id ( username, display_name )
        `)
        .eq('status', 'live')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row) {
        set({ active: null, messages: [] });
        return;
      }
      const event = rowToEvent(row);
      set({ active: event });

      // Pull last 200 messages for the event so users see context when
      // they join late.
      const { data: msgs } = await (supabase as any)
        .from('community_live_messages')
        .select(`
          id, event_id, user_id, body, is_host, created_at,
          profiles:user_id ( username, display_name )
        `)
        .eq('event_id', event.id)
        .order('created_at', { ascending: true })
        .limit(200);
      set({ messages: (msgs ?? []).map(rowToMessage) });
    } catch (err) {
      if (__DEV__) console.warn('[live-event] hydrate failed:', err);
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
          (payload: any) => {
            const msg = rowToMessage(payload.new);
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
