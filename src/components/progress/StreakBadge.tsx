/**
 * StreakBadge — consecutive-day logging streak.
 *
 * Counts the longest run of consecutive days ending today (or yesterday,
 * to give a grace window) where the user logged AT LEAST one event
 * (workout / meal / dose / checkin). Shows "current" + "best ever".
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useSectionAccent } from '../../hooks/useSectionAccent';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useMealStore } from '../../store/useMealStore';
import { useDoseLogStore } from '../../store/useDoseLogStore';
import { useCheckinStore } from '../../store/useCheckinStore';
import { FontSizes, Spacing, BorderRadius } from '../../constants/theme';

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const StreakBadge: React.FC = () => {
  const t = useTheme();
  const accent = useSectionAccent();

  const workoutLogs = useWorkoutStore((s) => s.logs);
  const meals = useMealStore((s) => s.meals);
  const doseLogs = useDoseLogStore((s) => s.doses);
  const checkins = useCheckinStore((s) => s.entries);

  const { current, best } = useMemo(() => {
    // Set of dateKeys with at least one event.
    const activeDays = new Set<string>();
    for (const w of workoutLogs) if (w.date) activeDays.add(w.date);
    for (const m of meals) if (m.date) activeDays.add(m.date);
    for (const d of doseLogs) if (d.date) activeDays.add(d.date);
    for (const c of checkins) if (c.date) activeDays.add(c.date);

    // Current streak: walk back from today until a missing day.
    // Grace: if today is missing but yesterday is active, count from yesterday.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let cur = 0;
    let startMs = today.getTime();
    if (!activeDays.has(dateKey(today))) {
      const y = new Date(today.getTime() - 86_400_000);
      if (activeDays.has(dateKey(y))) {
        startMs = y.getTime();
      } else {
        return computeBest(activeDays);
      }
    }
    for (let i = 0; ; i++) {
      const d = new Date(startMs - i * 86_400_000);
      if (activeDays.has(dateKey(d))) cur++;
      else break;
    }

    const { best } = computeBest(activeDays);
    return { current: cur, best: Math.max(best, cur) };
  }, [workoutLogs, meals, doseLogs, checkins]);

  return (
    <View style={[styles.wrap, { borderColor: t.cardBorder }]}>
      <View style={[styles.iconWrap, { backgroundColor: accent.deep + '20' }]}>
        <Ionicons name="flame" size={20} color={accent.deep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.current, { color: t.text }]}>
          {current} day{current === 1 ? '' : 's'}
        </Text>
        <Text style={[styles.sub, { color: t.textSecondary }]}>
          current streak · best ever {best}
        </Text>
      </View>
    </View>
  );
};

function computeBest(activeDays: Set<string>): { current: 0; best: number } {
  if (activeDays.size === 0) return { current: 0, best: 0 };
  const sortedTs = [...activeDays]
    .map((k) => new Date(k).getTime())
    .sort((a, b) => a - b);
  let run = 1;
  let best = 1;
  for (let i = 1; i < sortedTs.length; i++) {
    const diff = sortedTs[i]! - sortedTs[i - 1]!;
    if (diff === 86_400_000) {
      run++;
      best = Math.max(best, run);
    } else if (diff > 86_400_000) {
      run = 1;
    }
  }
  return { current: 0, best };
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  current: {
    fontSize: 18,
    fontFamily: 'DMSans-Bold',
  },
  sub: {
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
});
