/**
 * Live event chat screen — real-time text chat hosted by an admin.
 *
 * Flow:
 *   - Mount → store.subscribeToEvent(eventId) opens the Realtime channel
 *   - User types a message → sendMessage() → community-live-send-message
 *     edge function → DB insert → Realtime push → list updates
 *   - Host taps "End event" (admin only) → community-live-end → status
 *     flips, banner disappears app-wide
 *
 * Tier gate: handled in the edge function. The screen still loads for
 * non-Plus users so they can see scrolling history (read-only); the
 * composer hides itself if they aren't allowed to write.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../../src/hooks/useTheme';
import { Spacing, FontSizes, BorderRadius } from '../../../../src/constants/theme';
import { useLiveEventStore, type LiveMessage } from '../../../../src/store/useLiveEventStore';
import { useAuthStore } from '../../../../src/store/useAuthStore';
import { useCommunityStore } from '../../../../src/store/useCommunityStore';
import { useOnboardingStore } from '../../../../src/store/useOnboardingStore';
import { useTier } from '../../../../src/hooks/useFeatureGate';
import { LiveChatDisclaimerModal } from '../../../../src/components/LiveChatDisclaimerModal';

export default function LiveEventChatScreen() {
  const router = useRouter();
  const t = useTheme();
  const { eventId: rawEventId } = useLocalSearchParams<{ eventId: string }>();
  const eventId = String(rawEventId ?? '');

  const active = useLiveEventStore((s) => s.active);
  const messages = useLiveEventStore((s) => s.messages);
  const subscribe = useLiveEventStore((s) => s.subscribeToEvent);
  const unsubscribe = useLiveEventStore((s) => s.unsubscribe);
  const hydrate = useLiveEventStore((s) => s.hydrateActive);
  const pushLocalMessage = useLiveEventStore((s) => s.pushLocalMessage);
  const reportLiveMessage = useCommunityStore((s) => s.reportLiveMessage);

  const currentUserId = useAuthStore((s) => s.user?.id);
  const tier = useTier();
  const acceptedChatDisclaimer = useOnboardingStore(
    (s) => s.acceptedLiveChatDisclaimer,
  );

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    // Hydrate (in case user opened this URL directly without seeing the banner)
    if (!active || active.id !== eventId) {
      hydrate();
    }
    if (eventId) {
      subscribe(eventId);
    }
    return () => unsubscribe();
  }, [eventId, active?.id, hydrate, subscribe, unsubscribe]);

  // Auto-scroll to newest message on every new arrival.
  useEffect(() => {
    if (messages.length === 0) return;
    const id = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(id);
  }, [messages.length]);

  const isHost = !!currentUserId && active?.hostUserId === currentUserId;
  const required = active?.requiredTier ?? 'plus';
  const tierAllowed =
    isHost ||
    required === 'free' ||
    (required === 'plus' && (tier === 'plus' || tier === 'pro')) ||
    (required === 'pro' && tier === 'pro');

  const isLive = active?.status === 'live' && active.id === eventId;

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    // Disclaimer guard — defense in depth. The modal blocks the screen
    // for first-time visitors, but if it ever gets dismissed without
    // acceptance (e.g. orientation change race), keep posting locked.
    if (!acceptedChatDisclaimer) {
      Alert.alert('Please accept the chat disclaimer first.');
      return;
    }
    setSending(true);
    try {
      const { supabase } = await import('../../../../src/services/supabase');
      const { data, error } = await supabase.functions.invoke('community-live-send-message', {
        body: { eventId, body },
      });
      if (error) {
        Alert.alert('Could not send', error.message ?? 'Please try again.');
        return;
      }
      const payload = data as { error?: string; messageId?: string; createdAt?: string };
      if (payload?.error) {
        Alert.alert('Could not send', payload.error);
        return;
      }
      // Optimistic local push so the UI feels instant — Realtime will
      // ignore the duplicate when its INSERT echo arrives.
      if (payload?.messageId && currentUserId) {
        pushLocalMessage({
          id: payload.messageId,
          eventId,
          userId: currentUserId,
          body,
          isHost,
          createdAt: payload.createdAt ?? new Date().toISOString(),
        });
      }
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  const handleMessageLongPress = (msg: LiveMessage) => {
    const isOwn = msg.userId === currentUserId;
    const canManage = isOwn || isHost;
    // Owner / host get edit + delete (existing behavior). Everyone else
    // sees Report — Apple Guideline 1.2 requires a report path on every
    // UGC surface. Both menus only render while the event is still live;
    // once a transcript freezes, post-hoc moderation goes through admins.
    if (active?.status !== 'live') return;

    if (canManage) {
      Alert.alert('Message', undefined, [
        {
          text: 'Edit',
          onPress: () => {
            setEditingId(msg.id);
            setEditingDraft(msg.body);
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => confirmDelete(msg.id),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    Alert.alert('Message', undefined, [
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => promptReport(msg.id),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const promptReport = (messageId: string) => {
    const reasons: { key: 'spam' | 'harassment' | 'unsafe_medical_advice' | 'misinformation' | 'off_topic' | 'other'; label: string }[] = [
      { key: 'spam',                  label: 'Spam' },
      { key: 'harassment',            label: 'Harassment' },
      { key: 'unsafe_medical_advice', label: 'Unsafe medical advice' },
      { key: 'misinformation',        label: 'Misinformation' },
      { key: 'off_topic',             label: 'Off-topic' },
      { key: 'other',                 label: 'Other' },
    ];
    Alert.alert('Report message', 'Why are you reporting this?', [
      ...reasons.map((r) => ({
        text: r.label,
        onPress: async () => {
          const res = await reportLiveMessage({ messageId, reason: r.key });
          if (!res.ok) {
            Alert.alert('Could not report', res.error ?? 'Try again.');
          } else {
            Alert.alert('Reported', 'Thanks — moderators review every report.');
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const confirmDelete = (messageId: string) => {
    Alert.alert('Delete message?', 'This message will be hidden from the chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { supabase } = await import('../../../../src/services/supabase');
            const { data, error } = await supabase.functions.invoke('community-live-delete-message', {
              body: { messageId },
            });
            if (error) {
              Alert.alert('Could not delete', error.message ?? 'Try again.');
              return;
            }
            const payload = data as { error?: string };
            if (payload?.error) Alert.alert('Could not delete', payload.error);
          } catch (err: any) {
            Alert.alert('Could not delete', err?.message ?? 'Try again.');
          }
        },
      },
    ]);
  };

  const submitEdit = async () => {
    if (!editingId || !editingDraft.trim()) {
      setEditingId(null);
      setEditingDraft('');
      return;
    }
    try {
      const { supabase } = await import('../../../../src/services/supabase');
      const { data, error } = await supabase.functions.invoke('community-live-edit-message', {
        body: { messageId: editingId, body: editingDraft.trim() },
      });
      if (error) {
        Alert.alert('Could not edit', error.message ?? 'Try again.');
        return;
      }
      const payload = data as { error?: string };
      if (payload?.error) {
        Alert.alert('Could not edit', payload.error);
        return;
      }
    } catch (err: any) {
      Alert.alert('Could not edit', err?.message ?? 'Try again.');
    } finally {
      setEditingId(null);
      setEditingDraft('');
    }
  };

  const endEvent = async () => {
    Alert.alert('End live event?', 'This closes the chat for everyone. Transcript stays viewable.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End event',
        style: 'destructive',
        onPress: async () => {
          try {
            const { supabase } = await import('../../../../src/services/supabase');
            const { error } = await supabase.functions.invoke('community-live-end', {
              body: { eventId },
            });
            if (error) {
              Alert.alert('Could not end', error.message ?? 'Try again.');
              return;
            }
            router.back();
          } catch (err: any) {
            Alert.alert('Could not end', err?.message ?? 'Try again.');
          }
        },
      },
    ]);
  };

  // Plus+ paywall — live chat is a paying-members-only feature
  // (Edward, 2026-05-14). Free users hitting this route (via push, deep
  // link, lobby link) see an upsell instead of the transcript. The host
  // bypasses this even at lower tiers (they're hosting the event).
  if (!isHost && tier !== 'plus' && tier !== 'pro') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: t.cardBorder }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Leave"
          >
            <Ionicons name="chevron-back" size={24} color={t.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>
        <View style={{ flex: 1, padding: Spacing.lg, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: `${t.primary}18` }}>
            <Ionicons name="radio" size={32} color={t.primary} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center', color: t.text }}>
            Live chat is for paying members
          </Text>
          <Text style={{ fontSize: FontSizes.sm, lineHeight: 20, textAlign: 'center', maxWidth: 300, color: t.textSecondary }}>
            Join admin-hosted live events to ask questions in real time and
            chat with the PepTalk team. Available to PepTalk+ and Pro members.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/subscription' as any)}
            style={{ paddingVertical: 12, paddingHorizontal: 28, borderRadius: 999, marginTop: 12, backgroundColor: t.primary }}
            accessibilityRole="button"
            accessibilityLabel="See subscription plans"
          >
            <Text style={{ color: '#fff', fontSize: FontSizes.sm, fontWeight: '800', letterSpacing: 0.4 }}>See plans</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: t.cardBorder }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Leave live chat"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            {isLive && <View style={styles.liveDot} />}
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
              {active?.title ?? 'Live event'}
            </Text>
          </View>
          {active?.hostName && (
            <Text style={[styles.host, { color: t.textSecondary }]}>
              Hosted by {active.hostName}
            </Text>
          )}
        </View>
        {isHost && isLive && (
          <TouchableOpacity
            onPress={endEvent}
            style={styles.endBtn}
            accessibilityRole="button"
            accessibilityLabel="End live event"
          >
            <Text style={styles.endBtnText}>End</Text>
          </TouchableOpacity>
        )}
      </View>

      {!active && (
        <View style={styles.center}>
          <ActivityIndicator color={t.textSecondary} />
        </View>
      )}

      {active && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            ref={listRef}
            data={messages.filter((m) => !m.isDeleted)}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <MessageRow
                message={item}
                myUserId={currentUserId}
                onLongPress={() => handleMessageLongPress(item)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="chatbubbles-outline" size={32} color={t.textSecondary} />
                <Text style={[styles.emptyText, { color: t.textSecondary }]}>
                  {isLive ? 'Be the first to say something.' : 'This event has ended.'}
                </Text>
              </View>
            }
          />

          {!isLive && (
            <View style={[styles.endedBanner, { backgroundColor: t.glass }]}>
              <Ionicons name="lock-closed-outline" size={14} color={t.textSecondary} />
              <Text style={[styles.endedText, { color: t.textSecondary }]}>
                The host ended this event. You're seeing the transcript.
              </Text>
            </View>
          )}

          {isLive && tierAllowed && (
            <View style={[styles.composer, { borderTopColor: t.cardBorder, backgroundColor: t.bg }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Say something…"
                placeholderTextColor={t.textSecondary}
                multiline
                maxLength={1000}
                style={[styles.composerInput, { color: t.text, backgroundColor: t.glass }]}
              />
              <TouchableOpacity
                onPress={sendMessage}
                disabled={!draft.trim() || sending}
                style={[
                  styles.sendBtn,
                  { backgroundColor: t.primary, opacity: !draft.trim() || sending ? 0.5 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="arrow-up" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          )}

          {isLive && !tierAllowed && (
            <TouchableOpacity
              onPress={() => router.push('/subscription' as any)}
              style={styles.upgradeBar}
            >
              <Ionicons name="lock-closed" size={14} color="#fff" />
              <Text style={styles.upgradeText}>
                Joining the live chat requires PepTalk{required === 'pro' ? ' Pro' : '+'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </KeyboardAvoidingView>
      )}

      {/* Edit-message overlay — slide-up sheet that lets the author /
          host fix a typo in a live message. */}
      {editingId && (
        <View style={styles.editOverlay}>
          <View style={[styles.editSheet, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
            <Text style={[styles.editTitle, { color: t.text }]}>Edit message</Text>
            <TextInput
              value={editingDraft}
              onChangeText={setEditingDraft}
              multiline
              maxLength={1000}
              autoFocus
              style={[styles.editInput, { backgroundColor: t.glass, color: t.text }]}
            />
            <View style={styles.editButtons}>
              <TouchableOpacity
                onPress={() => {
                  setEditingId(null);
                  setEditingDraft('');
                }}
                style={[styles.editBtn, { backgroundColor: t.glass }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
              >
                <Text style={[styles.editBtnText, { color: t.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitEdit}
                disabled={!editingDraft.trim()}
                style={[
                  styles.editBtn,
                  { backgroundColor: t.primary, opacity: editingDraft.trim() ? 1 : 0.5 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save edit"
              >
                <Text style={[styles.editBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* First-entry medical disclaimer. Auto-shows when not yet accepted;
          stays mounted (zero-cost when accepted) so a fresh user can't
          slip past it via a deep-link from the lobby or push notification. */}
      <LiveChatDisclaimerModal />
    </SafeAreaView>
  );
}

function MessageRow({
  message,
  myUserId,
  onLongPress,
}: {
  message: LiveMessage;
  myUserId?: string;
  onLongPress?: () => void;
}) {
  const t = useTheme();
  const isMine = message.userId === myUserId;
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[styles.msgRow, isMine && styles.msgRowMine]}
      accessibilityRole="button"
      accessibilityLabel={`Message from ${message.authorName ?? 'member'}: ${message.body}${message.lastEditedAt ? ' (edited)' : ''}`}
    >
      <View
        style={[
          styles.msgBubble,
          {
            backgroundColor: isMine ? t.primary : t.glass,
            borderColor: t.cardBorder,
          },
          message.isHost && styles.msgBubbleHost,
        ]}
      >
        {!isMine && (
          <Text style={[styles.msgAuthor, { color: message.isHost ? '#3E7CB1' : t.textSecondary }]}>
            {message.authorName ?? (message.isHost ? 'Host' : 'Member')}
            {message.isHost && '  · HOST'}
          </Text>
        )}
        <Text style={[styles.msgBody, { color: isMine ? '#fff' : t.text }]}>{message.body}</Text>
        <View style={styles.msgFootRow}>
          {message.lastEditedAt && (
            <Text style={[styles.msgEdited, { color: isMine ? 'rgba(255,255,255,0.7)' : t.textSecondary }]}>
              edited ·
            </Text>
          )}
          <Text style={[styles.msgTime, { color: isMine ? 'rgba(255,255,255,0.7)' : t.textSecondary }]}>
            {time}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ef4444',
  },
  title: { fontSize: FontSizes.md, fontWeight: '800' },
  host: { fontSize: 11, marginTop: 2 },
  endBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ef4444',
  },
  endBtnText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  list: { padding: Spacing.md, gap: 8 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: FontSizes.sm },
  msgRow: { flexDirection: 'row' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgBubble: {
    maxWidth: '78%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  msgBubbleHost: { borderColor: '#3E7CB1', borderWidth: 1.5 },
  msgAuthor: { fontSize: 10, fontWeight: '700', marginBottom: 2, letterSpacing: 0.4 },
  msgBody: { fontSize: 14, lineHeight: 19 },
  msgFootRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4 },
  msgEdited: { fontSize: 9, fontStyle: 'italic' },
  msgTime: { fontSize: 9, textAlign: 'right' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    fontSize: FontSizes.sm,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    margin: 12,
    borderRadius: 10,
  },
  endedText: { fontSize: 11 },
  upgradeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#3E7CB1',
  },
  upgradeText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '700', flex: 1 },

  editOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  editSheet: {
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    gap: 12,
  },
  editTitle: { fontSize: FontSizes.md, fontWeight: '800' },
  editInput: {
    minHeight: 120,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.sm,
    textAlignVertical: 'top',
  },
  editButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  editBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  editBtnText: { fontSize: FontSizes.sm, fontWeight: '700' },
});
