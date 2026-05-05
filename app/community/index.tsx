/**
 * Community feed — Phase 1 (read-only foundation).
 *
 * Renders the topic chip strip + an empty-state placeholder. Posting
 * lands in Phase 2; this ships as a navigation-only surface so we can
 * smoke-test the new tab + the migration in TestFlight before adding
 * write paths.
 *
 * Tier model (locked in by Edward):
 *   - Read: free
 *   - Post: Plus +
 *
 * The free-tier nudge in the empty state previews that gating without
 * actually exposing the composer yet.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../src/constants/theme';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import type { CommunityTopic } from '../../src/types/community';

export default function CommunityFeedScreen() {
  const t = useTheme();
  const router = useRouter();
  const tier = useSubscriptionStore((s) => s.tier);
  const canPost = tier === 'plus' || tier === 'pro';

  const [topics, setTopics] = useState<CommunityTopic[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [loadingTopics, setLoadingTopics] = useState(true);

  // Fetch the seeded topic list. Phase 1 doesn't need posts yet — the
  // empty state shows even for an authenticated user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import('../../src/services/supabase');
        const { data, error } = await (supabase as any)
          .from('community_topics')
          .select('id, slug, name, description, icon, is_default, is_active, status, suggested_by, created_at')
          .eq('is_active', true)
          .eq('status', 'approved')
          .order('is_default', { ascending: false })
          .order('name', { ascending: true });
        if (cancelled) return;
        if (error) throw error;
        const mapped: CommunityTopic[] = (data ?? []).map((r: any) => ({
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
        setTopics(mapped);
      } catch (err) {
        if (__DEV__) console.warn('[community] topics fetch failed:', err);
      } finally {
        if (!cancelled) setLoadingTopics(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filterChips = useMemo(
    () => [
      { slug: null, name: 'All', icon: 'apps-outline' as const },
      ...topics.map((tp) => ({
        slug: tp.slug,
        name: tp.name,
        icon: (tp.icon ?? 'pricetag-outline') as React.ComponentProps<typeof Ionicons>['name'],
      })),
    ],
    [topics],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Community</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Topic chip strip */}
      <View style={styles.chipStripWrap}>
        {loadingTopics ? (
          <View style={{ paddingHorizontal: Spacing.md, paddingVertical: 8 }}>
            <ActivityIndicator size="small" color={t.textSecondary} />
          </View>
        ) : (
          <FlatList
            horizontal
            data={filterChips}
            keyExtractor={(item) => item.slug ?? '__all__'}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipStrip}
            renderItem={({ item }) => {
              const active = item.slug === activeSlug;
              return (
                <TouchableOpacity
                  onPress={() => setActiveSlug(item.slug)}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? t.primary : t.cardBorder,
                      backgroundColor: active ? t.primary + '18' : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={item.icon}
                    size={14}
                    color={active ? t.primary : t.textSecondary}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? t.primary : t.text },
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Empty-state hero */}
        <GlassCard style={styles.heroCard}>
          <View style={[styles.heroIcon, { backgroundColor: t.primary + '22' }]}>
            <Ionicons name="people-outline" size={28} color={t.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: t.text }]}>
            Community is opening soon
          </Text>
          <Text style={[styles.heroBody, { color: t.textSecondary }]}>
            A peer space to ask questions, share protocols, and compare notes
            with other PepTalk members. {activeSlug
              ? `Be the first to post in ${
                  topics.find((tp) => tp.slug === activeSlug)?.name ?? 'this topic'
                }.`
              : 'Posts will appear here as they\'re shared.'}
          </Text>

          {!canPost && (
            <View style={[styles.upsellBanner, { borderColor: t.cardBorder }]}>
              <Ionicons name="sparkles-outline" size={14} color={t.primary} />
              <Text style={[styles.upsellText, { color: t.text }]}>
                <Text style={{ fontWeight: '700' }}>PepTalk+ posts.</Text> Free
                accounts can read; posting unlocks with Plus.
              </Text>
              <TouchableOpacity onPress={() => router.push('/subscription' as any)}>
                <Text style={[styles.upsellLink, { color: t.primary }]}>Upgrade</Text>
              </TouchableOpacity>
            </View>
          )}
        </GlassCard>

        {/* Community guidelines preview */}
        <GlassCard style={styles.guidelinesCard}>
          <View style={styles.guidelinesHeader}>
            <Ionicons name="shield-checkmark-outline" size={16} color={t.text} />
            <Text style={[styles.guidelinesTitle, { color: t.text }]}>
              Community guidelines
            </Text>
          </View>
          <Text style={[styles.guidelinesItem, { color: t.textSecondary }]}>
            • Be helpful, not preachy. Share what worked for you, not what others should do.
          </Text>
          <Text style={[styles.guidelinesItem, { color: t.textSecondary }]}>
            • No specific dose recommendations to others. Talk about your own protocol.
          </Text>
          <Text style={[styles.guidelinesItem, { color: t.textSecondary }]}>
            • Cite when you can. "I read the SURMOUNT-1 trial" beats "I heard somewhere."
          </Text>
          <Text style={[styles.guidelinesItem, { color: t.textSecondary }]}>
            • Tag dose-related concerns with the ⚠ reaction so admins see them fast.
          </Text>
          <Text style={[styles.guidelinesItem, { color: t.textSecondary }]}>
            • Report harassment, spam, or unsafe advice — we read every report.
          </Text>
        </GlassCard>
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
  chipStripWrap: {
    paddingBottom: 4,
  },
  chipStrip: {
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: FontSizes.xs, fontWeight: '600' },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 40,
    gap: Spacing.sm,
  },
  heroCard: {
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 10,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  heroBody: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  upsellBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    width: '100%',
  },
  upsellText: { flex: 1, fontSize: 12, lineHeight: 16 },
  upsellLink: { fontSize: 12, fontWeight: '700' },
  guidelinesCard: {
    padding: Spacing.md,
    gap: 6,
  },
  guidelinesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  guidelinesTitle: { fontSize: FontSizes.sm, fontWeight: '700' },
  guidelinesItem: { fontSize: FontSizes.xs, lineHeight: 18 },
});
