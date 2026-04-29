/**
 * DailyInsightCard — single passive insight surfaced on home, derived
 * from real user state via getTodaysInsight().
 *
 * Different voice from Aimee chat chips: this is "Aimee notices..."
 * — informational, with one clear CTA. Hides itself when nothing fires.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { getTodaysInsight } from '../services/dailyInsights';
import { Spacing, FontSizes } from '../constants/theme';

export function DailyInsightCard() {
  const t = useTheme();
  const router = useRouter();
  const insight = useMemo(() => getTodaysInsight(), []);

  if (!insight) return null;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: `${insight.accentColor}20` }]}>
          <Ionicons name={insight.icon} size={18} color={insight.accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: insight.accentColor }]}>AIMEE NOTICED</Text>
          <Text style={[styles.title, { color: t.text }]}>{insight.title}</Text>
        </View>
      </View>

      <Text style={[styles.body, { color: t.textSecondary }]}>{insight.body}</Text>

      <TouchableOpacity
        onPress={() => router.push(insight.ctaRoute as any)}
        style={[styles.cta, { backgroundColor: insight.accentColor }]}
        accessibilityRole="button"
        accessibilityLabel={insight.ctaLabel}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaText}>{insight.ctaLabel}</Text>
        <Ionicons name="arrow-forward" size={14} color="#fff" />
      </TouchableOpacity>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md },
  headerRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: Spacing.sm },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: FontSizes.md, fontWeight: '700', marginTop: 1 },
  body: { fontSize: FontSizes.sm, lineHeight: 19, marginBottom: Spacing.md },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
  },
  ctaText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '700' },
});
