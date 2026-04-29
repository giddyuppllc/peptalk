/**
 * WeeklySummaryCard — 7-day rollup of every tracked stream.
 *
 * Reads from useDoseLogStore, useMealStore, useWorkoutStore, useCheckinStore,
 * useBiometricsStore. Renders a compact stat grid (steps avg, sleep avg,
 * meals logged, workouts done, doses taken, check-ins completed).
 *
 * Designed to slot above/below the calendar grid so the user gets a
 * "how was my week?" view without leaving the screen.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { useMealStore } from '../store/useMealStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useCheckinStore } from '../store/useCheckinStore';
import { useBiometricsStore } from '../store/useBiometricsStore';

interface Props {
  /** ISO YYYY-MM-DD anchoring the week. Default: today. */
  endDate?: string;
}

function dateRange(endDate: string): string[] {
  const end = new Date(endDate + 'T12:00:00');
  if (isNaN(end.getTime())) return [];
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

export function WeeklySummaryCard({ endDate }: Props) {
  const t = useTheme();
  const today = endDate ?? new Date().toISOString().slice(0, 10);
  const days = useMemo(() => dateRange(today), [today]);
  const startDate = days[0];
  const endDateKey = days[days.length - 1];

  // Pull what we need — use selectors so we don't re-render on unrelated changes
  const doses = useDoseLogStore((s) => s.doses);
  const meals = useMealStore((s) => s.meals);
  const workouts = useWorkoutStore((s) => s.logs);
  const checkIns = useCheckinStore((s) => s.entries);
  const sumScope = useBiometricsStore((s) => s.sumScopeInRange);
  const avgScope = useBiometricsStore((s) => s.avgScopeInRange);

  const stats = useMemo(() => {
    const inRange = (d: string) => d >= startDate && d <= endDateKey;
    const dosesCount = doses.filter((d) => inRange(d.date)).length;
    const mealsCount = meals.filter((m) => inRange(m.date)).length;
    const workoutsCount = workouts.filter((w) => inRange(w.date)).length;
    const checkinDays = new Set(checkIns.filter((c) => inRange(c.date)).map((c) => c.date)).size;

    const totalSteps = sumScope('steps', startDate, endDateKey);
    const avgSteps = totalSteps > 0 ? Math.round(totalSteps / 7) : 0;
    const avgSleepMin = avgScope('sleep_minutes', startDate, endDateKey);
    const avgRhr = avgScope('resting_heart_rate', startDate, endDateKey);
    const avgHrv = avgScope('hrv', startDate, endDateKey);

    return { dosesCount, mealsCount, workoutsCount, checkinDays, totalSteps, avgSteps, avgSleepMin, avgRhr, avgHrv };
  }, [doses, meals, workouts, checkIns, sumScope, avgScope, startDate, endDateKey]);

  const formatHours = (mins: number | null): string => {
    if (mins == null || isNaN(mins)) return '—';
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  };

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="bar-chart-outline" size={16} color={t.text} />
        <Text style={[styles.title, { color: t.text }]}>This Week</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.dateRange, { color: t.textSecondary }]}>Last 7 days</Text>
      </View>

      {/* Activity row */}
      <View style={styles.row}>
        <Stat label="Doses" value={stats.dosesCount} icon="flask-outline" color="#3E7CB1" t={t} />
        <Stat label="Meals" value={stats.mealsCount} icon="restaurant-outline" color="#6FA891" t={t} />
        <Stat label="Workouts" value={stats.workoutsCount} icon="barbell-outline" color="#D98C86" t={t} />
        <Stat label="Check-ins" value={`${stats.checkinDays}/7`} icon="clipboard-outline" color="#E89672" t={t} />
      </View>

      {/* Biometrics row — only if we have any */}
      {(stats.totalSteps > 0 || stats.avgSleepMin != null) && (
        <>
          <View style={[styles.divider, { backgroundColor: t.cardBorder }]} />
          <View style={styles.row}>
            {stats.avgSteps > 0 && (
              <Stat label="Avg steps" value={stats.avgSteps.toLocaleString()} icon="walk-outline" color="#3E7CB1" t={t} />
            )}
            {stats.avgSleepMin != null && (
              <Stat label="Avg sleep" value={formatHours(stats.avgSleepMin)} icon="moon-outline" color="#9B86A4" t={t} />
            )}
            {stats.avgRhr != null && (
              <Stat label="Avg RHR" value={Math.round(stats.avgRhr)} icon="heart-outline" color="#D98C86" t={t} />
            )}
            {stats.avgHrv != null && (
              <Stat label="Avg HRV" value={Math.round(stats.avgHrv)} icon="pulse-outline" color="#6FA891" t={t} />
            )}
          </View>
        </>
      )}
    </GlassCard>
  );
}

function Stat({
  label,
  value,
  icon,
  color,
  t,
}: {
  label: string;
  value: number | string;
  icon: any;
  color: string;
  t: any;
}) {
  return (
    <View style={styles.statCell}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.statValue, { color: t.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  dateRange: { fontSize: FontSizes.xs },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    marginTop: 2,
  },
  statLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
});
