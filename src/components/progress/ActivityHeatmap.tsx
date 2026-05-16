/**
 * ActivityHeatmap — GitHub-style activity grid for peptalk.
 *
 * Renders the last N weeks as a 7-row × N-column grid of dots, color
 * saturation = activity level for that day. Activity is computed from
 * the four input streams: workouts logged · meals logged · doses
 * logged · check-ins logged. Each contributes 1 to the day's "score";
 * a day with all four shows the saturated accent color.
 *
 * No interaction in the v1 — tapping a day is a Phase 2.5 future
 * enhancement that surfaces the day's events in a modal.
 *
 * Visual rule: no labels under each column. Months are inferred from
 * dot color and bar positioning. Keeps the grid clean.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useSectionAccent } from '../../hooks/useSectionAccent';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useMealStore } from '../../store/useMealStore';
import { useDoseLogStore } from '../../store/useDoseLogStore';
import { useCheckinStore } from '../../store/useCheckinStore';
import { Spacing, FontSizes } from '../../constants/theme';

interface Props {
  /** Weeks to render. 26 ≈ 6 months, 52 = full year. Default 26. */
  weeks?: number;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toMidnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export const ActivityHeatmap: React.FC<Props> = ({ weeks = 26 }) => {
  const t = useTheme();
  const accent = useSectionAccent();

  const workoutLogs = useWorkoutStore((s) => s.logs);
  const meals = useMealStore((s) => s.meals);
  const doseLogs = useDoseLogStore((s) => s.doses);
  const checkins = useCheckinStore((s) => s.entries);

  // Build a day → score map (0-4) across the window.
  const grid = useMemo(() => {
    const map = new Map<string, number>();
    const inc = (key: string) => map.set(key, (map.get(key) ?? 0) + 1);

    for (const w of workoutLogs) if (w.date) inc(w.date);
    for (const m of meals) if (m.date) inc(m.date);
    for (const d of doseLogs) if (d.date) inc(d.date);
    for (const c of checkins) if (c.date) inc(c.date);

    // Render top-to-bottom = Mon..Sun, left-to-right = oldest week..today.
    // Pad start so the rightmost column always ends on today.
    const today = toMidnight(new Date());
    const totalDays = weeks * 7;
    // Day index 0 = Mon, 6 = Sun. Whatever today is, the rightmost
    // column's bottom (Sunday) is today + (6 - todayDow) days but we
    // cap to today — anything in the future stays blank.
    const todayDow = (today.getDay() + 6) % 7; // Mon=0, Sun=6
    const trailingBlanks = 6 - todayDow;
    // Start = today − (totalDays - 1 - trailingBlanks) days
    const startMs = today.getTime() - (totalDays - 1 - trailingBlanks) * 86_400_000;

    const cols: { key: string; score: number; isFuture: boolean }[][] = [];
    for (let col = 0; col < weeks; col++) {
      const row: { key: string; score: number; isFuture: boolean }[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const ms = startMs + (col * 7 + dow) * 86_400_000;
        const d = new Date(ms);
        const isFuture = d.getTime() > today.getTime();
        const key = dateKey(d);
        row.push({ key, score: map.get(key) ?? 0, isFuture });
      }
      cols.push(row);
    }
    return cols;
  }, [workoutLogs, meals, doseLogs, checkins, weeks]);

  const totalLoggedDays = useMemo(() => {
    let n = 0;
    for (const col of grid) for (const cell of col) if (cell.score > 0) n++;
    return n;
  }, [grid]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: t.text }]}>Activity</Text>
        <Text style={[styles.totalText, { color: t.textSecondary }]}>
          {totalLoggedDays} active days
        </Text>
      </View>
      <View style={styles.grid}>
        {grid.map((col, ci) => (
          <View key={ci} style={styles.column}>
            {col.map((cell, ri) => (
              <View
                key={cell.key}
                style={[
                  styles.cell,
                  {
                    backgroundColor: cell.isFuture
                      ? 'transparent'
                      : colorForScore(cell.score, accent.deep, t.cardBorder),
                  },
                ]}
                accessibilityLabel={`${cell.key}: ${cell.score} activities`}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.legendRow}>
        <Text style={[styles.legendText, { color: t.textSecondary }]}>
          Less
        </Text>
        {[0, 1, 2, 3, 4].map((s) => (
          <View
            key={s}
            style={[
              styles.legendCell,
              { backgroundColor: colorForScore(s, accent.deep, t.cardBorder) },
            ]}
          />
        ))}
        <Text style={[styles.legendText, { color: t.textSecondary }]}>More</Text>
      </View>
    </View>
  );
};

// Score → color. 0 = empty (border tint), 4 = fully saturated accent.
function colorForScore(score: number, accent: string, emptyBg: string): string {
  if (score === 0) return emptyBg;
  // Interpolate alpha 30-100% based on score 1-4.
  const alphaPct = Math.min(100, 25 + score * 19); // 1→44, 2→63, 3→82, 4→100
  return withAlpha(accent, alphaPct / 100);
}

function withAlpha(hex: string, alpha: number): string {
  // hex is #RRGGBB; produce rgba(...) so we keep the accent hue.
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

const CELL = 11;
const GAP = 2;

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
  },
  totalText: {
    fontSize: FontSizes.xs,
    fontFamily: 'DMSans-Medium',
  },
  grid: {
    flexDirection: 'row',
    gap: GAP,
  },
  column: {
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
    justifyContent: 'flex-end',
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 10,
    fontFamily: 'DMSans-Medium',
  },
});
