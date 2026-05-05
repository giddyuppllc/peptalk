/**
 * PeptideTrendCard — "your weight while on retatrutide" style correlation
 * card. Reads biometric readings tagged with the peptide id (set at
 * write-time by useBiometricsStore.upsertReading) and surfaces the
 * change from first → most-recent reading.
 *
 * Hides itself when there's no tagged data — no value in showing an
 * empty state on every peptide page. Most useful for weight (recomp,
 * fat-loss peps) and HRV / RHR (recovery, GH peps).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes } from '../constants/theme';
import { useBiometricsStore, type BiometricScope } from '../store/useBiometricsStore';

interface PeptideTrendCardProps {
  peptideId: string;
  peptideName: string;
}

interface ScopeConfig {
  scope: BiometricScope;
  label: string;
  unit: string;
  /** Whether a decrease is the "good" direction (true for weight, body_fat). */
  decreaseIsImprovement: boolean;
}

const SCOPES: ScopeConfig[] = [
  { scope: 'weight',             label: 'Weight',           unit: 'lbs', decreaseIsImprovement: true },
  { scope: 'body_fat',           label: 'Body fat',         unit: '%',   decreaseIsImprovement: true },
  { scope: 'hrv',                label: 'HRV',              unit: 'ms',  decreaseIsImprovement: false },
  { scope: 'resting_heart_rate', label: 'Resting HR',       unit: 'bpm', decreaseIsImprovement: true },
  { scope: 'sleep_minutes',      label: 'Sleep',            unit: 'min', decreaseIsImprovement: false },
];

interface TrendRow {
  config: ScopeConfig;
  first: number;
  latest: number;
  delta: number;
  improving: boolean;
  daysSpanned: number;
}

export function PeptideTrendCard({ peptideId, peptideName }: PeptideTrendCardProps) {
  const t = useTheme();
  const readings = useBiometricsStore((s) => s.readings);

  const trends = useMemo<TrendRow[]>(() => {
    const tagged = readings.filter((r) => r.activePeptideIds?.includes(peptideId));
    if (tagged.length === 0) return [];

    const out: TrendRow[] = [];
    for (const config of SCOPES) {
      const matches = tagged
        .filter((r) => r.scope === config.scope)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (matches.length < 2) continue;
      const first = matches[0];
      const latest = matches[matches.length - 1];
      const delta = latest.value - first.value;
      if (Math.abs(delta) < 0.001) continue;
      const improving = config.decreaseIsImprovement ? delta < 0 : delta > 0;
      const daysSpanned = Math.max(
        1,
        Math.round(
          (new Date(latest.date).getTime() - new Date(first.date).getTime()) /
            (24 * 3600 * 1000),
        ),
      );
      out.push({
        config,
        first: first.value,
        latest: latest.value,
        delta,
        improving,
        daysSpanned,
      });
    }
    return out;
  }, [readings, peptideId]);

  if (trends.length === 0) return null;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: t.primary + '22' }]}>
          <Ionicons name="trending-up-outline" size={18} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>
            Your trends on {peptideName}
          </Text>
          <Text style={[styles.subtitle, { color: t.textSecondary }]}>
            Comparing your first reading on this protocol to your latest.
          </Text>
        </View>
      </View>

      <View style={[styles.list, { borderTopColor: t.cardBorder }]}>
        {trends.map((row) => {
          const tint = row.improving ? '#6FA891' : '#B45309';
          const arrow = row.delta < 0 ? '↓' : '↑';
          const sign = row.delta > 0 ? '+' : '';
          return (
            <View
              key={row.config.scope}
              style={[styles.row, { borderBottomColor: t.cardBorder }]}
            >
              <Text style={[styles.label, { color: t.text }]}>{row.config.label}</Text>
              <View style={styles.values}>
                <Text style={[styles.firstLatest, { color: t.textSecondary }]}>
                  {row.first.toFixed(1)} → {row.latest.toFixed(1)} {row.config.unit}
                </Text>
                <Text style={[styles.delta, { color: tint }]}>
                  {arrow} {sign}{row.delta.toFixed(1)}
                </Text>
                <Text style={[styles.span, { color: t.textSecondary }]}>
                  over {row.daysSpanned} day{row.daysSpanned === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={[styles.disclaimer, { color: t.textSecondary }]}>
        Correlation, not causation. Many factors drive these numbers — diet,
        sleep, training, season. Surface to your provider for a real read.
      </Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  subtitle: { fontSize: FontSizes.xs, marginTop: 2, lineHeight: 16 },
  list: { borderTopWidth: 1, paddingTop: 4 },
  row: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  label: { fontSize: FontSizes.sm, fontWeight: '700' },
  values: { alignItems: 'flex-end' },
  firstLatest: { fontSize: FontSizes.xs, marginBottom: 2 },
  delta: { fontSize: FontSizes.sm, fontWeight: '800' },
  span: { fontSize: 10, marginTop: 2 },
  disclaimer: {
    fontSize: 10,
    fontStyle: 'italic',
    lineHeight: 14,
    paddingTop: 8,
  },
});
