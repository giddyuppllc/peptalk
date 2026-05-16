/**
 * DoseHeatmap — 90-day grid showing dose-logging consistency, color-coded
 * per peptide so the user can see which protocol is driving cadence on
 * each day.
 *
 * Each cell takes the color of the *most-frequently logged peptide* that
 * day, mapped to its first category color (Metabolic / GH / Repair / etc.
 * — see src/constants/categories.ts). Cells with multiple distinct
 * peptides get a small white pip in the corner so mixed days are visible.
 * Empty days fall back to the card-border track color.
 *
 * Lives on the calendar tab beneath the weekly summary card. Hides
 * entirely when the user has no doses + no active protocols.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { Spacing, FontSizes } from '../constants/theme';
import { getPeptideById } from '../data/peptides';
import { getCategoryColor } from '../constants/categories';

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

interface DayCell {
  date: string;
  count: number;
  /** Hex color of the dominant peptide that day, or undefined when empty. */
  color?: string;
  /** True when more than one distinct peptide was logged. */
  mixed: boolean;
  /** Display name of the dominant peptide for accessibility / legend. */
  topPeptideId?: string;
}

export function DoseHeatmap() {
  const t = useTheme();
  const doses = useDoseLogStore((s) => s.doses);
  const protocols = useDoseLogStore((s) => s.protocols);

  // CRITICAL: do NOT early-return before the useMemo hooks below.
  // Doing so causes "Rendered more hooks than during the previous
  // render" — a guaranteed crash the first time a user logs their
  // first dose (the empty-state early-return runs zero hooks, then
  // the post-dose render runs four, and React's hook-order check
  // throws). P0 from Wave 76.10 render-safety audit.
  const anyDosed = doses.length > 0;
  const anyActive = protocols.some((p) => p.isActive);
  const hasAnyData = anyDosed || anyActive;

  // Group dose counts per (date, peptide) so we can pick a dominant
  // peptide per day for the cell color.
  const byDate = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const d of doses) {
      const inner = map.get(d.date) ?? new Map<string, number>();
      inner.set(d.peptideId, (inner.get(d.peptideId) ?? 0) + 1);
      map.set(d.date, inner);
    }
    return map;
  }, [doses]);

  // Resolve a stable color for a peptide id via its first category.
  const colorFor = (peptideId: string): string => {
    const p = getPeptideById(peptideId);
    if (!p || !p.categories || p.categories.length === 0) return '#3E7CB1';
    return getCategoryColor(p.categories[0]);
  };

  // Build grid columns oldest → newest (left to right).
  const grid: DayCell[][] = useMemo(() => {
    const cols: DayCell[][] = [];
    for (let c = 0; c < COLS; c++) {
      const col: DayCell[] = [];
      for (let r = 0; r < 7; r++) {
        const daysAgo = (COLS - 1 - c) * 7 + (6 - r);
        const date = dateKeyOffset(daysAgo);
        const inner = byDate.get(date);
        if (!inner || inner.size === 0) {
          col.push({ date, count: 0, mixed: false });
          continue;
        }
        let topId = '';
        let topCount = 0;
        let total = 0;
        for (const [pid, n] of inner.entries()) {
          total += n;
          if (n > topCount) { topCount = n; topId = pid; }
        }
        col.push({
          date,
          count: total,
          color: colorFor(topId),
          mixed: inner.size > 1,
          topPeptideId: topId,
        });
      }
      cols.push(col);
    }
    return cols;
  }, [byDate]);

  const totalLogged = useMemo(
    () => grid.reduce((acc, col) => acc + col.filter((c) => c.count > 0).length, 0),
    [grid],
  );

  // Top 3 peptides by dose count over the visible window — drives the
  // legend so the user knows which color = which peptide.
  const peptideLegend = useMemo(() => {
    const totals = new Map<string, number>();
    for (const col of grid) {
      for (const cell of col) {
        if (!cell.topPeptideId) continue;
        totals.set(cell.topPeptideId, (totals.get(cell.topPeptideId) ?? 0) + cell.count);
      }
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => {
        const p = getPeptideById(id);
        return { id, name: p?.name ?? id, color: colorFor(id) };
      });
  }, [grid]);

  // Empty state — heatmap of an empty user is just a wall of blanks.
  // Hide AFTER all hooks have run so hook order stays stable across
  // the first-dose-logged transition.
  if (!hasAnyData) return null;

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
            {col.map((cell, ri) => {
              // Intensity stacks on count: 1 = 45%, 2 = 75%, 3+ = 100%.
              const intensity = cell.count === 0 ? 0 : cell.count === 1 ? 0.45 : cell.count === 2 ? 0.75 : 1;
              const bg = cell.color
                ? withAlpha(cell.color, intensity)
                : t.cardBorder;
              return (
                <View
                  key={cell.date + ri}
                  style={[
                    styles.cell,
                    {
                      width: CELL,
                      height: CELL,
                      backgroundColor: bg,
                      marginBottom: ri === 6 ? 0 : GAP,
                    },
                  ]}
                >
                  {cell.mixed && <View style={styles.mixedPip} />}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {peptideLegend.length > 0 && (
        <View style={styles.legend}>
          {peptideLegend.map((p) => (
            <View key={p.id} style={styles.legendItem}>
              <View style={[styles.legendCell, { backgroundColor: p.color }]} />
              <Text style={[styles.legendText, { color: t.textSecondary }]} numberOfLines={1}>
                {p.name}
              </Text>
            </View>
          ))}
          {grid.flat().some((c) => c.mixed) && (
            <View style={styles.legendItem}>
              <View style={[styles.legendCell, { backgroundColor: t.cardBorder }]}>
                <View style={[styles.mixedPip, { position: 'relative', top: 0, right: 0 }]} />
              </View>
              <Text style={[styles.legendText, { color: t.textSecondary }]}>Mixed</Text>
            </View>
          )}
        </View>
      )}
    </GlassCard>
  );
}

/** Convert a hex color to an rgba string with the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    overflow: 'hidden',
  },
  mixedPip: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 110,
  },
  legendText: { fontSize: 10, fontWeight: '600' },
  legendCell: {
    width: 9,
    height: 9,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
