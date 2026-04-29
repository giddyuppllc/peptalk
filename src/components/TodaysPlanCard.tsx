/**
 * TodaysPlanCard — actionable to-do strip for the current day.
 *
 * Surfaces 3-5 items the user should hit today, derived from their
 * actual data:
 *   - Doses due (any active protocol where today's dose hasn't been logged)
 *   - Daily check-in (if they haven't done it yet)
 *   - Workout (if their active program has one scheduled today)
 *   - Meal logging gaps (calories logged < 25% of goal after lunch)
 *   - Period prep (if period in <2 days)
 *
 * Each row is tap-to-act. Hides itself entirely when nothing's left.
 *
 * Stays inside the proBlue accent family. No new colors introduced.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { useCheckinStore } from '../store/useCheckinStore';
import { useMealStore } from '../store/useMealStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useHealthProfileStore } from '../store/useHealthProfileStore';
import { getPeptideById } from '../data/peptides';
import { computeCyclePhase } from '../services/cycleService';
import { Spacing, FontSizes } from '../constants/theme';

interface PlanItem {
  key: string;
  icon: any;
  iconColor: string;
  label: string;
  detail?: string;
  onPress: () => void;
  /** Lower = surfaced higher in the list. */
  rank: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TodaysPlanCard() {
  const t = useTheme();
  const router = useRouter();

  const protocols = useDoseLogStore((s) => s.protocols);
  const doses = useDoseLogStore((s) => s.doses);
  const checkIns = useCheckinStore((s) => s.entries);
  const targets = useMealStore((s) => s.targets);
  const meals = useMealStore((s) => s.meals);
  const activeProgram = useWorkoutStore((s) => s.activeProgram);
  const workoutLogs = useWorkoutStore((s) => s.logs);
  const profile = useHealthProfileStore((s) => s.profile);

  const items: PlanItem[] = useMemo(() => {
    const today = todayKey();
    const out: PlanItem[] = [];

    // 1. Active protocols where today's dose hasn't been logged. Daily
    //    cadence only — weekly/biweekly protocols would false-positive.
    const todayDoses = doses.filter((d) => d.date === today);
    for (const p of protocols) {
      if (!p.isActive) continue;
      if (p.frequency !== 'daily' && p.frequency !== 'twice_daily') continue;
      const dosedToday = todayDoses.some((d) => d.peptideId === p.peptideId);
      if (dosedToday && p.frequency === 'daily') continue;
      const peptideName = getPeptideById(p.peptideId)?.name ?? p.peptideId;
      out.push({
        key: `dose-${p.id}`,
        icon: 'flask-outline',
        iconColor: '#3E7CB1',
        label: `Log ${peptideName} dose`,
        detail: `${p.dose} ${p.unit} · ${p.frequency.replace('_', ' ')}`,
        onPress: () => router.push('/(tabs)/calendar?openLog=1' as any),
        rank: 10,
      });
    }

    // 2. Daily check-in if not done today
    if (!checkIns.some((c) => c.date === today)) {
      out.push({
        key: 'check-in',
        icon: 'clipboard-outline',
        iconColor: '#E89672',
        label: 'Daily check-in',
        detail: 'Mood, energy, sleep — 30 seconds',
        onPress: () => router.push('/(tabs)/check-in' as any),
        rank: 20,
      });
    }

    // 3. Workout scheduled today (active program)
    if (activeProgram) {
      const dayOfProgram = (() => {
        const startedAt = (activeProgram as { startedAt?: string }).startedAt;
        if (!startedAt) return null;
        const start = new Date(startedAt).getTime();
        const now = new Date(today + 'T12:00:00').getTime();
        if (isNaN(start) || isNaN(now)) return null;
        return Math.floor((now - start) / (24 * 60 * 60 * 1000)) + 1;
      })();
      const workoutDoneToday = workoutLogs.some((w) => w.date === today);
      if (dayOfProgram != null && dayOfProgram > 0 && !workoutDoneToday) {
        out.push({
          key: 'workout',
          icon: 'barbell-outline',
          iconColor: '#D98C86',
          label: `Workout · Day ${dayOfProgram}`,
          detail: 'Open your program',
          onPress: () => router.push('/workouts/player' as any),
          rank: 30,
        });
      }
    }

    // 4. Meal logging — only flag mid-day if the user hasn't hit ~25% of goal
    const hour = new Date().getHours();
    if (hour >= 13 && targets?.calories && targets.calories > 0) {
      const todayCals = meals
        .filter((m) => m.date === today)
        .reduce((acc, m) => {
          const fromQuickLog = m.quickLog?.calories ?? 0;
          const fromFoods = (m.foods ?? []).reduce((s, f) => s + (f.calories ?? 0), 0);
          return acc + Math.max(fromQuickLog, fromFoods);
        }, 0);
      if (todayCals < targets.calories * 0.25) {
        out.push({
          key: 'meals',
          icon: 'restaurant-outline',
          iconColor: '#6FA891',
          label: "Log today's meals",
          detail: `${todayCals} of ${targets.calories} cal logged`,
          onPress: () => router.push('/(tabs)/nutrition' as any),
          rank: 40,
        });
      }
    }

    // 5. Period prep — female users with cycle tracking
    if (
      profile?.biologicalSex === 'female' &&
      profile?.cycle?.trackingEnabled &&
      profile?.cycle?.lastPeriodStartDate
    ) {
      const phaseInfo = computeCyclePhase(
        profile.cycle.lastPeriodStartDate,
        profile.cycle.typicalCycleLength,
        profile.cycle.typicalPeriodLength,
      );
      if (phaseInfo && phaseInfo.daysUntilNextPeriod > 0 && phaseInfo.daysUntilNextPeriod <= 2) {
        out.push({
          key: 'period',
          icon: 'flower-outline',
          iconColor: '#9B86A4',
          label: `Period in ${phaseInfo.daysUntilNextPeriod} day${phaseInfo.daysUntilNextPeriod === 1 ? '' : 's'}`,
          detail: 'Iron-rich meals + hydration',
          onPress: () => router.push('/cycle' as any),
          rank: 50,
        });
      }
    }

    return out.sort((a, b) => a.rank - b.rank).slice(0, 5);
  }, [protocols, doses, checkIns, meals, targets, activeProgram, workoutLogs, profile]);

  if (items.length === 0) return null;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="checkbox-outline" size={16} color={t.text} />
        <Text style={[styles.title, { color: t.text }]}>Today's plan</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.count, { color: t.textSecondary }]}>
          {items.length} {items.length === 1 ? 'task' : 'tasks'}
        </Text>
      </View>

      {items.map((item, idx) => (
        <TouchableOpacity
          key={item.key}
          onPress={item.onPress}
          style={[
            styles.row,
            idx > 0 && { borderTopWidth: 1, borderTopColor: t.cardBorder },
          ]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={item.label}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${item.iconColor}20` }]}>
            <Ionicons name={item.icon} size={16} color={item.iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: t.text }]}>{item.label}</Text>
            {item.detail && (
              <Text style={[styles.rowDetail, { color: t.textSecondary }]}>
                {item.detail}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={t.textSecondary} />
        </TouchableOpacity>
      ))}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  count: { fontSize: FontSizes.xs, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: FontSizes.sm, fontWeight: '600' },
  rowDetail: { fontSize: FontSizes.xs, marginTop: 2 },
});
