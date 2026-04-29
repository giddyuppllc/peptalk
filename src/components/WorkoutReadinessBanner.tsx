/**
 * WorkoutReadinessBanner — surfaces a readiness-aware suggestion at the
 * top of the Workouts tab.
 *
 * Three states:
 *   - score ≥ 70 → "Ready — go hard" (green)
 *   - score 45-69 → no banner (default state, doesn't add noise)
 *   - score < 45 → "Recover — go light" (amber) with a CTA to a
 *     mobility / recovery workout
 *
 * Hides itself entirely when no readiness score is available (no
 * biometrics + no recent check-in). Reuses the existing readinessScore
 * service so logic stays single-source.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { getReadinessScore } from '../services/readinessScore';
import { Spacing, FontSizes } from '../constants/theme';

export function WorkoutReadinessBanner() {
  const t = useTheme();
  const router = useRouter();
  const summary = useMemo(() => getReadinessScore(), []);

  if (!summary) return null;

  // Mid-band — no banner. Don't add visual noise on a normal day.
  if (summary.verdict === 'hold') return null;

  const isReady = summary.verdict === 'ready';
  const accent = isReady ? '#6FA891' : '#B45309';
  const label = isReady ? 'Today: Ready' : 'Today: Recover';
  const body = isReady
    ? `Readiness ${summary.score}/100 — strong window for a heavier session or a step bump.`
    : `Readiness ${summary.score}/100 — body's asking for a lighter day. Mobility / yoga / a walk works.`;

  return (
    <GlassCard style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: `${accent}20` }]}>
        <Ionicons
          name={isReady ? 'flash' : 'leaf-outline'}
          size={18}
          color={accent}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: accent }]}>
          {label}
        </Text>
        <Text style={[styles.body, { color: t.textSecondary }]} numberOfLines={2}>
          {body}
        </Text>
      </View>
      {!isReady && (
        <TouchableOpacity
          onPress={() => router.push('/workouts/library?category=yoga' as any)}
          style={[styles.cta, { backgroundColor: accent }]}
          accessibilityRole="button"
          accessibilityLabel="Browse light workouts"
        >
          <Text style={styles.ctaText}>Light day</Text>
        </TouchableOpacity>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: FontSizes.sm, fontWeight: '700' },
  body: { fontSize: FontSizes.xs, lineHeight: 16, marginTop: 2 },
  cta: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  ctaText: { color: '#fff', fontSize: FontSizes.xs, fontWeight: '700' },
});
