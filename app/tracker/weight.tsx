/**
 * Weight tracker — Master Refactor Plan v3.1 §5.2.
 *
 * Daily weight line chart. Pulls from two sources merged newest-first:
 *   - useBodyCompositionStore.scans[].weightLb (full scans)
 *   - useBiometricsStore weight readings (smart-scale / HealthKit pulls)
 *
 * Tap "Log weight" to route into body-comp entry where the user can
 * record a quick weight-only scan — same store, same trend.
 */

import React, { useMemo } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Line } from 'react-native-svg';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapMedium } from '../../src/utils/haptics';
import { useBodyCompositionStore } from '../../src/store/useBodyCompositionStore';
import { useBiometricsStore } from '../../src/store/useBiometricsStore';

interface Point {
  date: string;
  value: number;
}

export default function WeightTrackerScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const scans = useBodyCompositionStore((s) => s.scans);
  const readings = useBiometricsStore((s) => s.readings);

  const series = useMemo<Point[]>(() => {
    const merged = new Map<string, Point>();
    for (const s of scans) {
      if (s.weightLb == null) continue;
      const date = s.scannedAt.slice(0, 10);
      merged.set(date, { date, value: s.weightLb });
    }
    for (const r of readings) {
      if (r.scope !== 'weight') continue;
      if (!merged.has(r.date)) merged.set(r.date, { date: r.date, value: r.value });
    }
    return Array.from(merged.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [scans, readings]);

  const latest = series[series.length - 1];
  const first = series[0];
  const delta30 = useMemo(() => {
    if (series.length < 2) return null;
    const cutoff = Date.now() - 30 * 86400_000;
    const within = series.filter(
      (p) => new Date(p.date).getTime() >= cutoff,
    );
    if (within.length < 2) return null;
    return within[within.length - 1].value - within[0].value;
  }, [series]);

  return (
    <V3DetailShell
      title="Weight"
      observation={
        series.length === 0
          ? 'No weight logged yet. Add a scan to start trending.'
          : delta30 != null
            ? `${delta30 >= 0 ? '+' : ''}${delta30.toFixed(1)} lb over 30 days. Latest ${latest!.value.toFixed(1)} lb.`
            : `Latest ${latest!.value.toFixed(1)} lb on ${latest!.date}.`
      }
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <Pressable
          onPress={() => {
            tapMedium();
            router.push('/body-composition/entry' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="Log a new weight"
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.addRow}>
              <Ionicons
                name="add"
                size={20}
                color={t.colors.textPrimary as string}
              />
              <Text
                style={[
                  styles.addTitle,
                  {
                    color: t.colors.textPrimary as string,
                    fontFamily: t.typography.bodyBold,
                  },
                ]}
              >
                Log weight
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={t.colors.textSecondary as string}
              />
            </View>
          </GlassCard>
        </Pressable>

        {series.length >= 2 ? (
          <GlassCard style={styles.cardSpacing}>
            <Text
              style={[
                styles.statLabel,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.label,
                },
              ]}
            >
              ALL-TIME TREND
            </Text>
            <Text
              style={[
                styles.statValue,
                {
                  color: t.colors.textPrimary as string,
                  fontFamily: t.isDark
                    ? t.typography.numeralsMale
                    : t.typography.numeralsFemale,
                },
              ]}
            >
              {latest!.value.toFixed(1)} lb
            </Text>
            <Text
              style={[
                styles.statHint,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              {first!.date} → {latest!.date}
              {first ? ` · ${(latest!.value - first!.value).toFixed(1)} lb net` : ''}
            </Text>
            <TrendChart points={series} />
          </GlassCard>
        ) : (
          <GlassCard style={styles.cardSpacing}>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              Add a second weight reading and the trend line appears here.
            </Text>
          </GlassCard>
        )}

        {/* Per-entry list, newest first. */}
        {series.length > 0 ? (
          <>
            <Text
              style={[
                styles.sectionHeader,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              History
            </Text>
            {[...series].reverse().map((p) => (
              <GlassCard key={p.date} style={styles.entryCard}>
                <View style={styles.entryRow}>
                  <Text
                    style={{
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.bodyBold,
                      fontSize: 14,
                    }}
                  >
                    {p.value.toFixed(1)} lb
                  </Text>
                  <Text
                    style={{
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                      fontSize: 12,
                    }}
                  >
                    {p.date}
                  </Text>
                </View>
              </GlassCard>
            ))}
          </>
        ) : null}
      </ScrollView>
    </V3DetailShell>
  );
}

function TrendChart({ points }: { points: Point[] }) {
  const t = useV3Theme();
  const width = 300;
  const height = 110;
  const padding = 10;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.1, max - min);
  const stepX = (width - padding * 2) / Math.max(1, points.length - 1);
  const stroke = t.isDark
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentRose as string);
  const path = points
    .map((p, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((p.value - min) / span) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <View style={{ alignItems: 'center', marginTop: 12 }}>
      <Svg width={width} height={height}>
        <Line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke={(t.colors as any).divider as string}
          strokeWidth={1}
        />
        <Polyline
          points={path}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addTitle: {
    flex: 1,
    fontSize: 14,
  },
  statLabel: {
    fontSize: 9,
    letterSpacing: 1.4,
  },
  statValue: {
    fontSize: 38,
    marginTop: 6,
  },
  statHint: {
    fontSize: 12,
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
  },
  entryCard: {
    marginBottom: 8,
    paddingVertical: 12,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
