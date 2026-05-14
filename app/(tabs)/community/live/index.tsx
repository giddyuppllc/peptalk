/**
 * Past + active live events list — browse historical chat transcripts
 * + drop into any current live session.
 *
 * Active events render at top with the pulsing LIVE indicator; ended
 * events follow below in reverse-chronological order. Tap any row →
 * /community/live/[eventId] which renders the full transcript (or live
 * chat if status='live').
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../../src/hooks/useTheme';
import { Spacing, FontSizes, BorderRadius } from '../../../../src/constants/theme';
import { useTier } from '../../../../src/hooks/useFeatureGate';

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  status: 'scheduled' | 'live' | 'ended';
  started_at: string | null;
  ended_at: string | null;
  required_tier: 'free' | 'plus' | 'pro';
  host_user_id: string;
  profiles?: { username?: string; display_name?: string };
}

export default function LiveEventListScreen() {
  const router = useRouter();
  const t = useTheme();
  const tier = useTier();
  const isPaying = tier === 'plus' || tier === 'pro';
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { supabase } = await import('../../../../src/services/supabase');
      const { data } = await (supabase as any)
        .from('community_live_events')
        .select(`
          id, title, description, status, started_at, ended_at,
          required_tier, host_user_id,
          profiles:host_user_id ( username, display_name )
        `)
        .order('started_at', { ascending: false, nullsFirst: false })
        .limit(50);
      setEvents(data ?? []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Free users hit a paywall on the entire Live surface (lobby + transcripts).
  // Live chat is a Plus+ feature per product policy (Edward, 2026-05-14).
  if (!isPaying) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: t.text }]}>Live events</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.paywallWrap}>
          <View style={[styles.paywallIcon, { backgroundColor: `${t.primary}18` }]}>
            <Ionicons name="radio" size={32} color={t.primary} />
          </View>
          <Text style={[styles.paywallTitle, { color: t.text }]}>
            Live chat is a Plus member benefit
          </Text>
          <Text style={[styles.paywallBody, { color: t.textSecondary }]}>
            Join admin-hosted live events to ask questions in real time,
            chat with the PepTalk team, and learn alongside other members.
            Available to PepTalk+ and Pro subscribers.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/subscription' as any)}
            style={[styles.paywallCta, { backgroundColor: t.primary }]}
            accessibilityRole="button"
            accessibilityLabel="See subscription plans"
          >
            <Text style={styles.paywallCtaText}>See plans</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: t.text }]}>Live events</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="radio-outline" size={32} color={t.textSecondary} />
              <Text style={[styles.emptyText, { color: t.textSecondary }]}>
                No events yet — when an admin goes live it'll show up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <EventRowItem
              event={item}
              onPress={() => router.push(`/community/live/${item.id}` as any)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function EventRowItem({ event, onPress }: { event: EventRow; onPress: () => void }) {
  const t = useTheme();
  const isLive = event.status === 'live';
  const hostName =
    event.profiles?.display_name?.trim() ||
    event.profiles?.username?.trim() ||
    'PepTalk';
  const when = event.started_at ? new Date(event.started_at).toLocaleString() : '';
  const endedWhen = event.ended_at ? new Date(event.ended_at).toLocaleString() : '';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.row,
        {
          borderColor: isLive ? '#ef4444' : t.cardBorder,
          backgroundColor: t.card,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${isLive ? 'Live' : 'Past'} event: ${event.title}, hosted by ${hostName}`}
    >
      <View style={styles.rowTop}>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: isLive ? '#ef4444' : `${t.textSecondary}20` },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: isLive ? '#fff' : t.textSecondary },
            ]}
          >
            {isLive ? 'LIVE' : 'ENDED'}
          </Text>
        </View>
        <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={1}>
          {event.title}
        </Text>
      </View>
      <Text style={[styles.rowMeta, { color: t.textSecondary }]} numberOfLines={1}>
        Hosted by {hostName}
        {when ? ` · ${when}` : ''}
        {!isLive && endedWhen ? ` → ${endedWhen.split(',')[1]?.trim() ?? ''}` : ''}
      </Text>
      {event.description && (
        <Text style={[styles.rowDesc, { color: t.text }]} numberOfLines={2}>
          {event.description}
        </Text>
      )}
    </TouchableOpacity>
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
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSizes.lg, fontWeight: '700' },
  list: { padding: Spacing.md, gap: 10 },
  emptyWrap: { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyText: { fontSize: FontSizes.sm, textAlign: 'center', maxWidth: 260 },
  row: {
    padding: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 6,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  rowTitle: { flex: 1, fontSize: FontSizes.md, fontWeight: '800' },
  rowMeta: { fontSize: 11 },
  rowDesc: { fontSize: FontSizes.sm, lineHeight: 19, marginTop: 2 },

  // Free-tier paywall upsell
  paywallWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: 14,
  },
  paywallIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  paywallTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  paywallBody: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  paywallCta: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    marginTop: 12,
  },
  paywallCtaText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '800', letterSpacing: 0.4 },
});
