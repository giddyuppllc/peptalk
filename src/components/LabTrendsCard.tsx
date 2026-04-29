/**
 * LabTrendsCard — compact summary of the user's most recent lab values
 * with a trend marker vs. the prior draw.
 *
 * Renders nothing when no labs are entered. Caller is expected to wrap
 * in a section header and place an "Add labs" CTA nearby.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import {
  LAB_MARKERS,
  useLabResultsStore,
  type LabMarker,
} from '../store/useLabResultsStore';
import { Spacing, FontSizes } from '../constants/theme';

type TrendDirection = 'up' | 'down' | 'flat' | 'none';

interface MarkerSummary {
  marker: LabMarker;
  current: number;
  currentDate: string;
  prior?: number;
  priorDate?: string;
  trend: TrendDirection;
  /** Is the current value within the reference range? */
  inRange: boolean;
  /** Did the trend move toward "favorable" given preferHigh? */
  favorable: 'better' | 'worse' | 'neutral';
}

function classifyTrend(current: number, prior?: number): TrendDirection {
  if (prior == null) return 'none';
  const delta = current - prior;
  // 2% threshold to avoid flagging noise as a trend
  const tolerance = Math.abs(prior) * 0.02;
  if (delta > tolerance) return 'up';
  if (delta < -tolerance) return 'down';
  return 'flat';
}

export function LabTrendsCard() {
  const router = useRouter();
  const t = useTheme();
  const results = useLabResultsStore((s) => s.results);

  const summaries: MarkerSummary[] = useMemo(() => {
    if (results.length === 0) return [];
    // Group by markerId, sorted newest-first within each group.
    const byMarker = new Map<string, typeof results>();
    for (const r of results) {
      if (!byMarker.has(r.markerId)) byMarker.set(r.markerId, []);
      byMarker.get(r.markerId)!.push(r);
    }
    const out: MarkerSummary[] = [];
    for (const [markerId, entries] of byMarker) {
      const marker = LAB_MARKERS.find((m) => m.id === markerId);
      if (!marker) continue;
      const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
      const cur = sorted[0];
      const prior = sorted[1];
      const trend = classifyTrend(cur.value, prior?.value);
      const inRange =
        marker.refLow != null && marker.refHigh != null
          ? cur.value >= marker.refLow && cur.value <= marker.refHigh
          : true;
      let favorable: 'better' | 'worse' | 'neutral' = 'neutral';
      if (trend !== 'none' && trend !== 'flat') {
        // preferHigh means "up = better". preferHigh undefined treats as
        // higher = worse (LDL, glucose, etc. — most things on a panel).
        const wantsUp = marker.preferHigh === true;
        if (trend === 'up') favorable = wantsUp ? 'better' : 'worse';
        else favorable = wantsUp ? 'worse' : 'better';
      }
      out.push({
        marker,
        current: cur.value,
        currentDate: cur.date,
        prior: prior?.value,
        priorDate: prior?.date,
        trend,
        inRange,
        favorable,
      });
    }
    // Most-recently-updated first
    return out.sort((a, b) => b.currentDate.localeCompare(a.currentDate));
  }, [results]);

  if (summaries.length === 0) {
    return (
      <GlassCard style={styles.emptyCard}>
        <Ionicons name="flask-outline" size={28} color={t.textMuted} />
        <Text style={[styles.emptyTitle, { color: t.text }]}>No labs entered yet</Text>
        <Text style={[styles.emptyBody, { color: t.textSecondary }]}>
          Add your most recent bloodwork so Aimee can answer questions with
          your real numbers — not generic ranges.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/health-report/labs' as any)}
          style={[styles.cta, { backgroundColor: t.primary }]}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.ctaText}>Add Lab Values</Text>
        </TouchableOpacity>
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="flask" size={16} color="#3E7CB1" />
        <Text style={[styles.title, { color: t.text }]}>Recent Labs</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => router.push('/health-report/labs' as any)}
          accessibilityRole="link"
        >
          <Text style={[styles.editLink, { color: '#3E7CB1' }]}>Edit / Add</Text>
        </TouchableOpacity>
      </View>

      {summaries.slice(0, 8).map((s) => (
        <View
          key={s.marker.id}
          style={[styles.row, { borderBottomColor: t.cardBorder }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.markerLabel, { color: t.text }]}>{s.marker.label}</Text>
            <Text style={[styles.markerSub, { color: t.textSecondary }]}>
              {s.currentDate}
              {s.prior != null
                ? ` · prev ${s.prior} (${s.priorDate})`
                : ''}
              {s.marker.refLow != null && s.marker.refHigh != null
                ? ` · ref ${s.marker.refLow}–${s.marker.refHigh}`
                : ''}
            </Text>
          </View>

          <View style={styles.valueWrap}>
            <Text
              style={[
                styles.valueNum,
                { color: s.inRange ? t.text : '#B45309' },
              ]}
            >
              {s.current}
            </Text>
            <Text style={[styles.valueUnit, { color: t.textSecondary }]}>
              {s.marker.unit}
            </Text>
          </View>

          {s.trend !== 'none' && s.trend !== 'flat' && (
            <Ionicons
              name={s.trend === 'up' ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={
                s.favorable === 'better'
                  ? '#16A34A'
                  : s.favorable === 'worse'
                    ? '#DC2626'
                    : t.textMuted
              }
              style={{ marginLeft: 6 }}
            />
          )}
        </View>
      ))}

      {summaries.length > 8 && (
        <TouchableOpacity
          onPress={() => router.push('/health-report/labs' as any)}
          style={styles.moreLink}
        >
          <Text style={[styles.moreLinkText, { color: '#3E7CB1' }]}>
            View all {summaries.length} markers →
          </Text>
        </TouchableOpacity>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md },
  emptyCard: {
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyTitle: { fontSize: FontSizes.md, fontWeight: '700' },
  emptyBody: { fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 18 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: Spacing.sm,
  },
  ctaText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  editLink: { fontSize: FontSizes.xs, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  markerLabel: { fontSize: FontSizes.sm, fontWeight: '600' },
  markerSub: { fontSize: 11, marginTop: 2 },
  valueWrap: { alignItems: 'flex-end' },
  valueNum: { fontSize: FontSizes.lg, fontWeight: '800' },
  valueUnit: { fontSize: 10, marginTop: 1 },
  moreLink: { paddingTop: Spacing.sm, alignItems: 'center' },
  moreLinkText: { fontSize: FontSizes.xs, fontWeight: '600' },
});
