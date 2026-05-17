/**
 * WeekStrip — last 7 days, one row, dots per category.
 *
 * Each day shows up to 4 colored dots stacked or aligned in a small
 * cluster — one each for workouts / meals / doses / check-ins. Today
 * is the rightmost cell and gets a subtle highlight ring.
 *
 * Use case: "What did I do this week?" at a glance, no tap needed.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useMealStore } from '../../store/useMealStore';
import { useDoseLogStore } from '../../store/useDoseLogStore';
import { useCheckinStore } from '../../store/useCheckinStore';
import { Spacing, FontSizes } from '../../constants/theme';

const DOT_COLORS = {
  workout: '#E89672',
  meal: '#6FA891',
  dose: '#7ABED0',
  checkin: '#9B86A4',
};

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(d: Date): string {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()]!;
}

export const WeekStrip: React.FC = () => {
  const t = useTheme();
  const workoutLogs = useWorkoutStore((s) => s.logs);
  const meals = useMealStore((s) => s.meals);
  const doseLogs = useDoseLogStore((s) => s.doses);
  const checkins = useCheckinStore((s) => s.entries);

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out: {
      key: string;
      label: string;
      isToday: boolean;
      workout: boolean;
      meal: boolean;
      dose: boolean;
      checkin: boolean;
    }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const key = dateKey(d);
      out.push({
        key,
        label: dayLabel(d),
        isToday: i === 0,
        workout: workoutLogs.some((w) => w.date === key),
        meal: meals.some((m) => m.date === key),
        dose: doseLogs.some((dl) => dl.date === key),
        checkin: checkins.some((c) => c.date === key),
      });
    }
    return out;
  }, [workoutLogs, meals, doseLogs, checkins]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: t.text }]}>This week</Text>
        <View style={styles.legend}>
          <Legend color={DOT_COLORS.workout} label="Workouts" />
          <Legend color={DOT_COLORS.meal} label="Meals" />
          <Legend color={DOT_COLORS.dose} label="Doses" />
          <Legend color={DOT_COLORS.checkin} label="Checkins" />
        </View>
      </View>
      <View style={styles.row}>
        {days.map((d) => (
          <View
            key={d.key}
            style={[
              styles.cell,
              d.isToday && {
                borderColor: t.text,
                borderWidth: 1,
              },
            ]}
          >
            <Text style={[styles.dayLabel, { color: t.textSecondary }]}>{d.label}</Text>
            <View style={styles.dotGrid}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: d.workout ? DOT_COLORS.workout : 'rgba(0,0,0,0.06)' },
                ]}
              />
              <View
                style={[
                  styles.dot,
                  { backgroundColor: d.meal ? DOT_COLORS.meal : 'rgba(0,0,0,0.06)' },
                ]}
              />
              <View
                style={[
                  styles.dot,
                  { backgroundColor: d.dose ? DOT_COLORS.dose : 'rgba(0,0,0,0.06)' },
                ]}
              />
              <View
                style={[
                  styles.dot,
                  { backgroundColor: d.checkin ? DOT_COLORS.checkin : 'rgba(0,0,0,0.06)' },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
  },
  legend: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 9,
    color: 'rgba(0,0,0,0.55)',
    fontFamily: 'DMSans-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  cell: {
    flex: 1,
    aspectRatio: 0.7,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  dayLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.5,
  },
  dotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    justifyContent: 'center',
    width: 18,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
