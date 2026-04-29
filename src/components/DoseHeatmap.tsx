/**
 * DoseHeatmap — 90-day grid showing dose-logging consistency.
 *
 * GitHub-style cell heatmap (no labels, just colored squares) so the user
 * can see at a glance how steady their cadence has been. Empty days are
 * a faint track color; logged days fill with proBlue, intensity scaled
 * by dose count (1 = 25%, 2+ = 100%).
 *
 * Stays inside the proBlue palette. Rendered on the calendar tab beneath
 * the weekly summary card.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { Spacing, FontSizes } from '../constants/theme';

const DAYS = 90;
const COLS = 13;            // 13 weeks × 7 days = 91 ≈ 90 days
const CELL = 12;
const GAP = 3;

function dateKeyOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DoseHeatmap() {
  const t = useTheme();
  const doses = useDoseLogStore((s) => s.doses);
  const protocols = useDoseLogStore((s) => s.protocols);

  // Hide entirely if user has never logged a dose AND has no active
  // protocols — heatmap of an empty user is just a wall of blanks.
  const anyDosed = doses.length > 0;
  const anyActive = protocols.some((p) => p.isActive);
  if (!anyDosed && !anyActive) return null;

  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const d of doses) {
      out.set(d.date, (out.get(d.date) ?? 0) + 1);
    }
    return out;
  }, [doses]);

  const totalLogged = useMemo(
    () =>
      Array.from({ length: DAYS })
        .map((_, i) => dateKeyOffset(i))
        .filter((k) => (counts.get(k) ?? 0) > 0).length,
    [counts],
  );

  // Build grid columns oldest → newest (left to right).
  const grid: string[][] = useMemo(() => {
    const cols: string[][] = [];
    // Total days we'll render = COLS × 7
    for (let c = 0; c < COLS; c++) {
      const col: string[] = [];
      for (let r = 0; r < 7; r++) {
        const daysAgo = (COLS - 1 - c) * 7 + (6 - r);
        col.push(dateKeyOffset(daysAgo));
      }
      cols.push(col);
    }
    return cols;
  }, []);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="grid-outline" size={16} color={t.text} />
        <Text style={[styles.title, { color: t.text }]}>Dose consistency</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.summary, { color: t.textSecondary }]}>
          {totalLogged} / {DAYS} days
        </Text>
      </View>

      <View style={styles.grid}>
        {grid.map((col, ci) => (
          <View key={ci} style={{ marginRight: ci === COLS - 1 ? 0 : GAP }}>
            {col.map((dateKey, ri) => {
              const count = counts.get(dateKey) ?? 0;
              // Intensity: 0 = empty track, 1 = 35%, 2 = 65%, 3+ = 100%
              const intensity = count === 0 ? 0 : count === 1 ? 0.35 : count === 2 ? 0.65 : 1;
              const bg =
                intensity === 0
                  ? `${t.cardBorder}`
                  : `rgba(62, 124, 177, ${intensity})`;
              return (
                <View
                  key={dateKey + ri}
                  style={[
                    styles.cell,
                    {
                      width: CELL,
                      height: CELL,
                      backgroundColor: bg,
                      marginBottom: ri === 6 ? 0 : GAP,
                    },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: t.textSecondary }]}>Less</Text>
        <View style={[styles.legendCell, { backgroundColor: t.cardBorder }]} />
        <View style={[styles.legendCell, { backgroundColor: 'rgba(62,124,177,0.35)' }]} />
        <View style={[styles.legendCell, { backgroundColor: 'rgba(62,124,177,0.65)' }]} />
        <View style={[styles.legendCell, { backgroundColor: 'rgba(62,124,177,1)' }]} />
        <Text style={[styles.legendText, { color: t.textSecondary }]}>More</Text>
      </View>
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
  summary: { fontSize: FontSizes.xs, fontWeight: '600' },
  grid: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  cell: {
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
  },
  legendText: { fontSize: 10 },
  legendCell: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
});
