/**
 * Admin moderation queue — open reports + pending topic suggestions.
 *
 * Gated to admins (BETA_TESTER_EMAILS allowlist). Queries directly via
 * RLS — service-role calls happen via the community-moderate edge fn.
 *
 * Two tabs: Reports (pending) + Topic suggestions (pending_review).
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../src/constants/theme';
import { useAuthStore } from '../../src/store/useAuthStore';
import { REPORT_REASON_LABELS } from '../../src/types/community';

interface ReportRow {
  id: string;
  reporter_id: string;
  reason: string;
  notes: string | null;
  status: string;
  created_at: string;
  post_id: string | null;
  comment_id: string | null;
  post_snapshot?: { id: string; title: string; body: string; user_id: string; is_deleted: boolean } | null;
  comment_snapshot?: { id: string; body: string; user_id: string; is_deleted: boolean } | null;
}

interface TopicRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  suggested_by: string | null;
  created_at: string;
}

export default function CommunityAdminQueue() {
  const t = useTheme();
  const router = useRouter();
  const userEmail = useAuthStore((s) => s.user?.email)?.toLowerCase();

  const [tab, setTab] = useState<'reports' | 'topics'>('reports');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguish a genuinely-clear queue ("No pending reports") from a
  // fetch failure — safety-relevant, since a silent failure hid pending
  // unsafe_medical_advice / harassment reports behind reassuring copy.
  const [error, setError] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(false);
    try {
      const { supabase } = await import('../../src/services/supabase');

      const { data: reportRows, error: reportsError } = await (supabase as any)
        .from('community_reports')
        .select(`
          id, reporter_id, reason, notes, status, created_at,
          post_id, comment_id,
          post_snapshot:community_posts!community_reports_post_id_fkey ( id, title, body, user_id, is_deleted ),
          comment_snapshot:community_comments!community_reports_comment_id_fkey ( id, body, user_id, is_deleted )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);

      const { data: topicRows, error: topicsError } = await (supabase as any)
        .from('community_topics')
        .select('id, slug, name, description, status, suggested_by, created_at')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false });

      if (reportsError || topicsError) {
        setError(true);
        setReports([]);
        setTopics([]);
      } else {
        setReports(reportRows ?? []);
        setTopics(topicRows ?? []);
      }
    } catch (err) {
      if (__DEV__) console.warn('[admin/community-queue]', err);
      setError(true);
      setReports([]);
      setTopics([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const moderate = async (action: string, payload: Record<string, unknown>) => {
    try {
      const { supabase } = await import('../../src/services/supabase');
      const { data: { session } } = await (supabase as any).auth.getSession();
      if (!session?.access_token) return Alert.alert('Sign in required');
      const { data, error } = await (supabase as any).functions.invoke('community-moderate', {
        body: { action, ...payload },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await refresh();
    } catch (err: any) {
      Alert.alert('Action failed', err?.message ?? 'Unknown error');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Admin queue</Text>
        <TouchableOpacity onPress={refresh} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Refresh">
          <Ionicons name="refresh-outline" size={20} color={t.text} />
        </TouchableOpacity>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabs}>
        {(['reports', 'topics'] as const).map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => setTab(k)}
            style={[
              styles.tab,
              {
                borderBottomColor: tab === k ? t.primary : 'transparent',
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: tab === k ? t.primary : t.textSecondary, fontWeight: tab === k ? '700' : '500' },
              ]}
            >
              {k === 'reports' ? `Reports (${reports.length})` : `Topics (${topics.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {loading ? (
          <ActivityIndicator color={t.textSecondary} style={{ marginTop: 40 }} />
        ) : error ? (
          <TouchableOpacity
            onPress={refresh}
            style={styles.errorWrap}
            accessibilityRole="button"
            accessibilityLabel="Retry loading the moderation queue"
          >
            <Ionicons name="cloud-offline-outline" size={32} color="#D43A3A" />
            <Text style={[styles.errorText, { color: t.text }]}>
              Couldn't load the queue — tap to retry.
            </Text>
          </TouchableOpacity>
        ) : tab === 'reports' ? (
          reports.length === 0 ? (
            <Text style={[styles.empty, { color: t.textSecondary }]}>No pending reports.</Text>
          ) : (
            reports.map((r) => {
              const target = r.post_snapshot
                ? { kind: 'post', text: `${r.post_snapshot.title}\n\n${r.post_snapshot.body}`, deleted: r.post_snapshot.is_deleted }
                : r.comment_snapshot
                ? { kind: 'comment', text: r.comment_snapshot.body, deleted: r.comment_snapshot.is_deleted }
                : null;
              return (
                <GlassCard key={r.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.reasonBadge, { backgroundColor: t.primary + '22' }]}>
                      <Text style={[styles.reasonText, { color: t.primary }]}>
                        {REPORT_REASON_LABELS[r.reason as keyof typeof REPORT_REASON_LABELS] ?? r.reason}
                      </Text>
                    </View>
                    <Text style={[styles.timestamp, { color: t.textSecondary }]}>
                      {new Date(r.created_at).toLocaleString()}
                    </Text>
                  </View>

                  {target && (
                    <View style={[styles.targetBox, { borderColor: t.cardBorder }]}>
                      <Text style={[styles.targetKind, { color: t.textSecondary }]}>
                        {target.kind} · {target.deleted ? 'already deleted' : 'visible'}
                      </Text>
                      <Text style={[styles.targetText, { color: t.text }]} numberOfLines={6}>
                        {target.text}
                      </Text>
                    </View>
                  )}

                  {r.notes && (
                    <Text style={[styles.notes, { color: t.textSecondary }]}>
                      Reporter notes: "{r.notes}"
                    </Text>
                  )}

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: t.cardBorder }]}
                      onPress={() =>
                        Alert.alert('Dismiss?', 'Leave content visible.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Dismiss', onPress: () => moderate('dismiss', { reportId: r.id }) },
                        ])
                      }
                    >
                      <Text style={[styles.actionText, { color: t.text }]}>Dismiss</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
                      onPress={() =>
                        Alert.alert('Delete content?', 'Soft-deletes the post or comment everywhere.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => moderate('delete', { reportId: r.id }) },
                        ])
                      }
                    >
                      <Text style={[styles.actionText, { color: '#fff' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              );
            })
          )
        ) : topics.length === 0 ? (
          <Text style={[styles.empty, { color: t.textSecondary }]}>No pending topic suggestions.</Text>
        ) : (
          topics.map((tp) => (
            <GlassCard key={tp.id} style={styles.card}>
              <Text style={[styles.topicName, { color: t.text }]}>{tp.name}</Text>
              <Text style={[styles.topicSlug, { color: t.textSecondary }]}>/{tp.slug}</Text>
              {tp.description && (
                <Text style={[styles.topicDesc, { color: t.text }]}>{tp.description}</Text>
              )}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: t.cardBorder }]}
                  onPress={() => moderate('reject_topic', { slug: tp.slug })}
                >
                  <Text style={[styles.actionText, { color: t.text }]}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: t.primary }]}
                  onPress={() => moderate('approve_topic', { slug: tp.slug })}
                >
                  <Text style={[styles.actionText, { color: '#fff' }]}>Approve</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: 16,
    marginBottom: 4,
  },
  tab: { paddingVertical: 8, borderBottomWidth: 2 },
  tabText: { fontSize: FontSizes.sm },
  list: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 40,
    gap: Spacing.sm,
  },
  empty: { padding: 30, textAlign: 'center', fontSize: FontSizes.sm },
  errorWrap: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 30 },
  errorText: { fontSize: FontSizes.sm, textAlign: 'center', fontWeight: '600' },
  card: { padding: Spacing.md, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reasonBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  reasonText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  timestamp: { fontSize: 11 },
  targetBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  targetKind: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  targetText: { fontSize: FontSizes.xs, lineHeight: 17 },
  notes: { fontSize: 11, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4, justifyContent: 'flex-end' },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionText: { fontSize: FontSizes.xs, fontWeight: '700' },
  topicName: { fontSize: FontSizes.md, fontWeight: '700' },
  topicSlug: { fontSize: 11 },
  topicDesc: { fontSize: FontSizes.sm, marginTop: 6 },
});
