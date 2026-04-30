/**
 * Cycle history + insights — past periods, averages, trends.
 *
 * Simple for 1.9.0. Symptom correlation charts land in 1.9.x once we
 * have more history to plot meaningfully.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useCycleStore } from '../../src/store/useCycleStore';
import { computeCycleStats } from '../../src/services/cyclePredictor';

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) /
      (24 * 3600 * 1000),
  );
}

export default function CycleHistoryScreen() {
  const router = useRouter();
  const t = useTheme();
  // Compute stats via useMemo on the store's stable `periods` array.
  // Calling s.getStats() in the selector returned a fresh object every
  // render which caused an infinite re-render loop on Zustand's === check.
  const periods = useCycleStore((s) => s.periods);
  const stats = useMemo(() => computeCycleStats(periods), [periods]);

  const sorted = useMemo(
    () => [...periods].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [periods],
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
        <Text style={[styles.headerTitle, { color: t.text }]}>History</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        {stats ? (
          <View style={styles.section}>
            <GlassCard>
              <View style={styles.statGrid}>
                <View style={styles.statCell}>
                  <Text style={[styles.statNumber, { color: t.text }]}>{stats.avgCycleLength}</Text>
                  <Text style={[styles.statLabel, { color: t.textSecondary }]}>avg cycle</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNumber, { color: t.text }]}>{stats.avgPeriodLength}</Text>
                  <Text style={[styles.statLabel, { color: t.textSecondary }]}>avg period</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNumber, { color: t.text }]}>{stats.cycleCount}</Text>
                  <Text style={[styles.statLabel, { color: t.textSecondary }]}>cycles</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNumber, { color: t.text }]}>
                    {stats.irregularityScore.toFixed(0)}%
                  </Text>
                  <Text style={[styles.statLabel, { color: t.textSecondary }]}>variability</Text>
                </View>
              </View>
              <View style={styles.rangeRow}>
                <Text style={[styles.rangeText, { color: t.textSecondary }]}>
                  Range: {stats.shortestCycle}–{stats.longestCycle} days
                </Text>
              </View>
            </GlassCard>
          </View>
        ) : (
          <View style={styles.section}>
            <GlassCard>
              <Text style={[styles.emptyMsg, { color: t.textSecondary }]}>
                Log 2+ periods to see averages and variability.
              </Text>
            </GlassCard>
          </View>
        )}

        {/* Period list */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: t.textSecondary }]}>
            PERIODS
          </Text>
          {sorted.length === 0 ? (
            <GlassCard>
              <Text style={[styles.emptyMsg, { color: t.textSecondary }]}>
                No periods logged yet.
              </Text>
            </GlassCard>
          ) : (
            <GlassCard>
              {sorted.map((p, i) => {
                const lengthDays =
                  p.endDate != null ? daysBetween(p.startDate, p.endDate) + 1 : null;
                const nextStart = sorted[i - 1]?.startDate;
                const cycleDays = nextStart ? daysBetween(p.startDate, nextStart) : null;
                return (
                  <View
                    key={p.id}
                    style={[
                      styles.periodRow,
                      i < sorted.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: 'rgba(0,0,0,0.08)',
                      },
                    ]}
                  >
                    <View>
                      <Text style={[styles.periodDate, { color: t.text }]}>
                        {shortDate(p.startDate)}
                      </Text>
                      {p.endDate && (
                        <Text style={[styles.periodSub, { color: t.textSecondary }]}>
                          to {shortDate(p.endDate)}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {lengthDays != null && (
                        <Text style={[styles.periodMeta, { color: t.text }]}>
                          {lengthDays} day{lengthDays === 1 ? '' : 's'}
                        </Text>
                      )}
                      {cycleDays != null && (
                        <Text style={[styles.periodCycle, { color: t.textSecondary }]}>
                          {cycleDays}-day cycle
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </GlassCard>
          )}
        </View>
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCell: {
    width: '50%',
    paddingVertical: 8,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'Playfair-Black',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  rangeRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
  },
  rangeText: {
    fontSize: 12,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  periodDate: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  periodSub: {
    fontSize: 12,
    marginTop: 2,
  },
  periodMeta: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  periodCycle: {
    fontSize: 11,
    marginTop: 2,
  },
  emptyMsg: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
