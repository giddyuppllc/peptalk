/**
 * KeepItSimpleCard — plain-language summary of what a peptide is for.
 *
 * Designed to sit at the very top of the peptide detail page. Reads
 * the goalPeptideMatrix to surface "This is good for: X, Y, Z" so a
 * user doesn't have to parse the research summary just to understand
 * the basic indication.
 *
 * Hidden when the peptide isn't in the matrix (rare — should be most
 * peptides). Always 2–4 lines; never a wall of text.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { plainGoalsForPeptide } from '../data/goalPeptideMatrix';
import { getGoalLabel } from '../constants/goals';
import { Spacing, FontSizes } from '../constants/theme';

interface Props {
  peptideId: string;
}

export function KeepItSimpleCard({ peptideId }: Props) {
  const t = useTheme();
  const goals = useMemo(() => plainGoalsForPeptide(peptideId), [peptideId]);
  if (goals.length === 0) return null;

  // Top 4 goals max — anything more is noise. Goal labels comma-separated.
  const goalLabels = goals.slice(0, 4).map((g) => getGoalLabel(g.goal));
  const primary = goals.find((g) => g.tier === 'primary');
  const headline = primary?.reason ?? goals[0]?.reason ?? '';

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: '#3E7CB120' }]}>
          <Ionicons name="bulb" size={16} color="#3E7CB1" />
        </View>
        <Text style={[styles.title, { color: t.text }]}>Keep it simple</Text>
      </View>

      <Text style={[styles.label, { color: t.textSecondary }]}>This is good for:</Text>
      <Text style={[styles.goals, { color: t.text }]}>
        {goalLabels.join(' · ')}
      </Text>

      {!!headline && (
        <Text style={[styles.headline, { color: t.textSecondary }]}>
          {headline}
        </Text>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, marginBottom: Spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  goals: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    lineHeight: 22,
  },
  headline: {
    fontSize: FontSizes.sm,
    lineHeight: 19,
    marginTop: Spacing.sm,
  },
});
