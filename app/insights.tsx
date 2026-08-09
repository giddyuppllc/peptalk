/**
 * Insights — your own data, correlated. The screen the analysis never had.
 *
 * src/services/watchCorrelationService is a complete peptide ↔ biometric
 * correlation engine. Its own header advertises exactly what it produces:
 * "Your HRV improved 18% since starting BPC-157", "Sleep quality dropped after
 * stopping Ipamorelin". It computes a 7-day pre-protocol baseline, a during
 * average, a percentage change and a trend, per metric, per active protocol.
 *
 * It had exactly ONE caller: app/(tabs)/peptalk.tsx, which pipes the result
 * through buildCorrelationSummaryForBot into Aimee's chat context.
 *
 * So the analysis existed, ran, and was only ever visible if the user thought
 * to ASK for it in a chat. There was no screen. Logging and tracking is one of
 * the main points of this app; computing the answer and then hiding it behind a
 * conversation is the same "built but never reaches the user" shape as
 * everything else in this sweep, just with better maths behind it.
 *
 * This screen renders the same engine's output directly. It adds no new
 * analysis and changes no thresholds — the numbers here are the numbers Aimee
 * was already quoting.
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../src/components/GlassCard';
import { useTheme } from '../src/hooks/useTheme';
import { useSectionAccent } from '../src/hooks/useSectionAccent';
import { Spacing, BorderRadius, FontSizes } from '../src/constants/theme';
import { useDoseLogStore } from '../src/store/useDoseLogStore';
import { useCheckinStore } from '../src/store/useCheckinStore';
import { useSideEffectStore } from '../src/store/useSideEffectStore';
import { getPeptideById } from '../src/data/peptides';
import { generateCorrelationInsights } from '../src/services/watchCorrelationService';
import { tallySymptoms, describeTally } from '../src/lib/sideEffectSummary';
import {
  rankCorrelations,
  trendMeta,
  formatChange,
  MIN_DATA_POINTS,
} from '../src/lib/insights';

export default function InsightsScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();

  const protocols = useDoseLogStore((s) => s.protocols);
  const checkIns = useCheckinStore((s) => s.entries);
  const sideEffects = useSideEffectStore((s) => s.entries);

  const insights = useMemo(
    () =>
      generateCorrelationInsights(
        (protocols ?? []).filter((p) => p.isActive),
        checkIns ?? [],
        (id) => getPeptideById(id)?.name ?? id,
      ),
    [protocols, checkIns],
  );

  const hasAnyProtocol = (protocols ?? []).some((p) => p.isActive);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: t.text }]}>Insights</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {!hasAnyProtocol ? (
          <GlassCard style={styles.card}>
            <Ionicons name="analytics-outline" size={36} color={accent.deep} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>Nothing to compare yet</Text>
            <Text style={[styles.body, { color: t.textSecondary }]}>
              Insights compare your check-ins before and during a protocol. Start
              one and log check-ins for a week or so, and the changes show up here.
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/check-in' as never)}
              accessibilityRole="button"
              accessibilityLabel="Go to check-in"
              style={[styles.primaryBtn, { backgroundColor: accent.deep }]}
            >
              <Text style={styles.primaryBtnText}>Log a check-in</Text>
            </Pressable>
          </GlassCard>
        ) : (
          insights.map((insight) => {
            const ranked = rankCorrelations(insight.correlations);
            const thin = ranked.filter((c) => c.dataPoints < MIN_DATA_POINTS);
            const usable = ranked.filter((c) => c.dataPoints >= MIN_DATA_POINTS);
            const symptoms = tallySymptoms(
              (sideEffects ?? []).filter((e) => e.peptideId === insight.peptideId),
            );

            return (
              <GlassCard key={insight.peptideId} style={styles.card}>
                <Text style={[styles.peptideName, { color: t.text }]}>
                  {insight.peptideName}
                </Text>
                <Text style={[styles.subtle, { color: t.textSecondary }]}>
                  Day {insight.daysOnProtocol} · since {insight.protocolStartDate}
                </Text>

                {usable.length === 0 ? (
                  <Text style={[styles.body, { color: t.textSecondary, marginTop: 12 }]}>
                    Not enough check-ins yet to compare against your baseline. Keep
                    logging — this fills in on its own.
                  </Text>
                ) : (
                  usable.map((c) => {
                    const meta = trendMeta(c.trend);
                    return (
                      <View
                        key={c.metric}
                        style={[styles.metricRow, { borderTopColor: t.cardBorder }]}
                      >
                        <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.metricLabel, { color: t.text }]}>{c.label}</Text>
                          <Text style={[styles.metricDetail, { color: t.textSecondary }]}>
                            {/* dataPoints is shown on every row on purpose. A
                                percentage from four check-ins and one from forty
                                look identical otherwise, and the first is noise. */}
                            {c.dataPoints} check-ins
                          </Text>
                        </View>
                        <Text style={[styles.metricChange, { color: meta.color }]}>
                          {formatChange(c.changePercent)}
                        </Text>
                      </View>
                    );
                  })
                )}

                {symptoms.length > 0 ? (
                  <View style={styles.symptomBlock}>
                    <Text style={[styles.blockLabel, { color: t.textSecondary }]}>
                      SIDE EFFECTS YOU LOGGED
                    </Text>
                    {symptoms.map((s) => (
                      <Text key={s.symptom} style={[styles.metricDetail, { color: t.text }]}>
                        • {s.symptom} — {describeTally(s)}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {thin.length > 0 && usable.length > 0 ? (
                  <Text style={[styles.subtle, { color: t.textMuted, marginTop: 10 }]}>
                    {thin.length} more metric{thin.length === 1 ? '' : 's'} need more
                    check-ins before they mean anything.
                  </Text>
                ) : null}
              </GlassCard>
            );
          })
        )}

        <Text style={[styles.disclaimer, { color: t.textMuted }]}>
          These are correlations in your own logs, not cause and effect. Plenty of
          things move these numbers. Educational only — discuss anything clinical
          with your provider.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  scroll: { padding: Spacing.md, paddingBottom: 80 },
  card: { padding: Spacing.md, marginBottom: Spacing.md },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: '700', marginTop: 10 },
  body: { fontSize: FontSizes.sm, lineHeight: 20, marginTop: 6 },
  primaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
  peptideName: { fontSize: FontSizes.md, fontWeight: '700' },
  subtle: { fontSize: FontSizes.xs, marginTop: 2 },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  metricLabel: { fontSize: FontSizes.sm, fontWeight: '600' },
  metricDetail: { fontSize: FontSizes.xs, marginTop: 2, lineHeight: 18 },
  metricChange: { fontSize: FontSizes.md, fontWeight: '700' },
  symptomBlock: { marginTop: 14 },
  blockLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', marginBottom: 6 },
  disclaimer: { fontSize: FontSizes.xs, textAlign: 'center', marginTop: 8, lineHeight: 16 },
});
