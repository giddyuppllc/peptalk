/**
 * PerformanceTeaserCard — single-row card on the home dashboard linking
 * to the Performance page. Shows the user's overall consistency
 * percentage and a chevron — full bubble grid lives at /performance.
 *
 * Replaces the inline IntelligenceHeatMap on home: same data, lighter
 * footprint, single tap to drill in.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { useSectionAccent } from '../hooks/useSectionAccent';
import { Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useCheckinStore } from '../store/useCheckinStore';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useMealStore } from '../store/useMealStore';
import { useJournalStore } from '../store/useJournalStore';

const DAYS = 30;

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function PerformanceTeaserCard() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();

  // Reuse the same 2+-pillars-per-day rule as the consistency bubble.
  const checkins = useCheckinStore((s) => s.entries);
  const doses = useDoseLogStore((s) => s.doses);
  const workouts = useWorkoutStore((s) => s.logs);
  const meals = useMealStore((s) => s.meals);
  const journal = useJournalStore((s) => s.entries);

  const pct = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const dates = new Set<string>();
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.add(toDateKey(d));
    }
    const pillarsByDate = new Map<string, Set<string>>();
    const tag = (date: string, pillar: string) => {
      if (!dates.has(date)) return;
      if (!pillarsByDate.has(date)) pillarsByDate.set(date, new Set());
      pillarsByDate.get(date)!.add(pillar);
    };
    for (const c of checkins) if (c.date) tag(c.date, 'checkin');
    for (const d of doses) if (d.date) tag(d.date, 'dose');
    for (const w of workouts) if (w.date) tag(w.date, 'workout');
    for (const m of meals) if (m.date) tag(m.date, 'meal');
    for (const j of journal) if (j.date) tag(j.date, 'journal');
    let active = 0;
    for (const set of pillarsByDate.values()) {
      if (set.size >= 2) active++;
    }
    return Math.round((active / DAYS) * 100);
  }, [checkins, doses, workouts, meals, journal]);

  return (
    <TouchableOpacity
      onPress={() => router.push('/performance' as any)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Open performance breakdown"
    >
      <GlassCard style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: `${accent.deep}22` }]}>
          <Ionicons name="speedometer-outline" size={20} color={accent.deep} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Performance</Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>
            {pct}% consistent in the last 30 days · tap for the full breakdown
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: BorderRadius.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  body: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
});

export default PerformanceTeaserCard;
