/**
 * IntelligenceHeatMap — GitHub-style daily activity heat map for the
 * past N weeks. Cells are colored by an "intelligence score" combining
 * the day's check-in, doses, workouts, meals, and journal activity.
 *
 * Purpose: give the user a single-glance read on consistency. Streaks
 * pop visually; gaps show where they fell off; the highest-intensity
 * days are the days they used every pillar.
 *
 * Data sources (all local, no network):
 *   - useCheckinStore.entries
 *   - useDoseLogStore.doses
 *   - useWorkoutStore.logs
 *   - useMealStore.meals
 *   - useJournalStore.entries
 *
 * Score per day (0-5):
 *   +1 daily check-in saved
 *   +1 at least one dose logged
 *   +1 at least one workout logged
 *   +1 at least one meal logged
 *   +1 at least one journal entry
 *
 * Colors map score → opacity ramp on the section accent so the
 * heat map skins to whichever screen embeds it.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useSectionAccent } from '../hooks/useSectionAccent';
import { Spacing, FontSizes } from '../constants/theme';
import { useCheckinStore } from '../store/useCheckinStore';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useMealStore } from '../store/useMealStore';
import { useJournalStore } from '../store/useJournalStore';

interface HeatMapProps {
  /** Number of weeks back to render. Default 12 (~3 months). */
  weeks?: number;
  /** Tap a cell — receives the YYYY-MM-DD date. Optional. */
  onDayPress?: (date: string) => void;
}

const DAY_OF_WEEK_LABELS = ['Mon', 'Wed', 'Fri'];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function IntelligenceHeatMap({ weeks = 12, onDayPress }: HeatMapProps) {
  const t = useTheme();
  const accent = useSectionAccent();

  const checkins = useCheckinStore((s) => s.entries);
  const doses = useDoseLogStore((s) => s.doses);
  const workouts = useWorkoutStore((s) => s.logs);
  const meals = useMealStore((s) => s.meals);
  const journal = useJournalStore((s) => s.entries);

  // Build a Map<date, score>. Each pillar contributes at most 1 per day.
  const scoreByDate = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (date: string) => {
      m.set(date, (m.get(date) ?? 0) + 1);
    };

    // De-dup per (date, pillar) using a Set of `${date}|${pillar}` so
    // multiple meals on one day still only score 1.
    const seen = new Set<string>();
    const tag = (date: string, pillar: string) => {
      const key = `${date}|${pillar}`;
      if (seen.has(key)) return;
      seen.add(key);
      bump(date);
    };

    for (const c of checkins) {
      if (c.date) tag(c.date, 'checkin');
    }
    for (const d of doses) {
      if (d.date) tag(d.date, 'dose');
    }
    for (const w of workouts) {
      if (w.date) tag(w.date, 'workout');
    }
    for (const meal of meals) {
      if (meal.date) tag(meal.date, 'meal');
    }
    for (const j of journal) {
      if (j.date) tag(j.date, 'journal');
    }

    return m;
  }, [checkins, doses, workouts, meals, journal]);

  // Build the grid: 7 rows × `weeks` columns. Most-recent week is
  // rightmost so the eye moves left→right through history.
  const grid = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const dayOfWeek = today.getDay(); // 0 Sun – 6 Sat
    // Anchor to most recent Sunday so each column is a Sun-Sat week.
    const anchor = new Date(today);
    anchor.setDate(anchor.getDate() - dayOfWeek);

    const cols: { week: number; days: { date: string; score: number; future: boolean }[] }[] = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const days: { date: string; score: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const cell = new Date(anchor);
        cell.setDate(anchor.getDate() - w * 7 + d);
        const date = toDateKey(cell);
        const future = cell.getTime() > today.getTime();
        days.push({
          date,
          score: scoreByDate.get(date) ?? 0,
          future,
        });
      }
      cols.push({ week: w, days });
    }
    return cols;
  }, [scoreByDate, weeks]);

  // Color ramp: 0 = pale border, 5 = full accent.
  const cellColor = (score: number, future: boolean): string => {
    if (future) return 'transparent';
    if (score === 0) return t.cardBorder;
    const opacity = 0.2 + (Math.min(score, 5) / 5) * 0.8;
    // Use accent.deep with variable alpha. Deep is a hex color we can
    // suffix with hex alpha (00–FF).
    const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
    return `${accent.deep}${alphaHex}`;
  };

  // Stats for the legend header.
  const totalScored = useMemo(() => {
    let max = 0;
    let active = 0;
    for (const col of grid) {
      for (const cell of col.days) {
        if (cell.future) continue;
        if (cell.score > 0) active++;
        if (cell.score > max) max = cell.score;
      }
    }
    return { active, max, totalDays: weeks * 7 };
  }, [grid, weeks]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>Intelligence heat map</Text>
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          {totalScored.active} of last {totalScored.totalDays} days active
        </Text>
      </View>

      <View style={styles.body}>
        {/* Day-of-week labels */}
        <View style={styles.dowColumn}>
          <Text style={[styles.dowLabel, { color: t.textSecondary }]}>{DAY_OF_WEEK_LABELS[0]}</Text>
          <View style={{ height: 6 }} />
          <View style={{ height: 12 }} />
          <Text style={[styles.dowLabel, { color: t.textSecondary }]}>{DAY_OF_WEEK_LABELS[1]}</Text>
          <View style={{ height: 6 }} />
          <View style={{ height: 12 }} />
          <Text style={[styles.dowLabel, { color: t.textSecondary }]}>{DAY_OF_WEEK_LABELS[2]}</Text>
        </View>

        {/* Grid */}
        <View style={styles.grid}>
          {grid.map((col) => (
            <View key={col.week} style={styles.column}>
              {col.days.map((cell) => {
                const tap = onDayPress && !cell.future
                  ? () => onDayPress(cell.date)
                  : undefined;
                return (
                  <Pressable
                    key={cell.date}
                    onPress={tap}
                    accessibilityRole={tap ? 'button' : undefined}
                    accessibilityLabel={
                      cell.future
                        ? `${cell.date} (future)`
                        : `${cell.date}: ${cell.score} of 5 pillars`
                    }
                    style={[
                      styles.cell,
                      {
                        backgroundColor: cellColor(cell.score, cell.future),
                        borderColor: cell.future ? 'transparent' : t.cardBorder,
                      },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={[styles.legendLabel, { color: t.textSecondary }]}>Less</Text>
        {[0, 1, 2, 3, 4, 5].map((score) => (
          <View
            key={score}
            style={[
              styles.legendCell,
              {
                backgroundColor: cellColor(score, false),
                borderColor: t.cardBorder,
              },
            ]}
          />
        ))}
        <Text style={[styles.legendLabel, { color: t.textSecondary }]}>More</Text>
      </View>
    </View>
  );
}

const CELL = 12;
const CELL_GAP = 3;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  title: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 11,
  },
  body: {
    flexDirection: 'row',
    gap: 6,
  },
  dowColumn: {
    paddingTop: CELL + CELL_GAP, // skip top row to align with Mon
  },
  dowLabel: {
    fontSize: 9,
    height: CELL,
    lineHeight: CELL,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  column: {
    gap: CELL_GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 2,
    borderWidth: 0.5,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  legendLabel: {
    fontSize: 10,
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 0.5,
  },
});

export default IntelligenceHeatMap;
