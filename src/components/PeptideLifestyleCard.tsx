/**
 * PeptideLifestyleCard — surfaces the per-peptide fitness / vitamin /
 * lifestyle guidance from peptideNutrition.ts. Renders only when a
 * peptide actually has at least one of those fields populated, so
 * users don't see an empty card on peptides where the editorial
 * pass hasn't filled them in.
 *
 * Three sections: Fitness, Vitamins & supplements, Lifestyle. Each
 * section hides itself if the corresponding data block is missing.
 *
 * Lives on the peptide detail page beneath the trend / cycle cards.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes } from '../constants/theme';
import { getPeptideNutrition } from '../data/peptideNutrition';

interface PeptideLifestyleCardProps {
  peptideId: string;
  peptideName: string;
}

export function PeptideLifestyleCard({ peptideId, peptideName }: PeptideLifestyleCardProps) {
  const t = useTheme();
  const nutrition = getPeptideNutrition(peptideId);

  if (!nutrition) return null;
  const hasFitness = !!nutrition.fitnessGuidance;
  const hasVitamins = (nutrition.vitaminEmphasis?.length ?? 0) > 0;
  const hasLifestyle = (nutrition.lifestyleNotes?.length ?? 0) > 0;
  if (!hasFitness && !hasVitamins && !hasLifestyle) return null;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: t.primary + '22' }]}>
          <Ionicons name="sparkles-outline" size={18} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>
            What pairs with {peptideName}
          </Text>
          <Text style={[styles.subtitle, { color: t.textSecondary }]}>
            Fitness, supplements, and lifestyle pieces that compound the protocol's effects.
          </Text>
        </View>
      </View>

      {hasFitness && nutrition.fitnessGuidance && (
        <View style={[styles.section, { borderTopColor: t.cardBorder }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="barbell-outline" size={14} color={t.text} />
            <Text style={[styles.sectionTitle, { color: t.text }]}>Fitness</Text>
          </View>
          <Text style={[styles.body, { color: t.text }]}>
            {nutrition.fitnessGuidance.emphasis}
          </Text>
          {nutrition.fitnessGuidance.timing && (
            <Text style={[styles.body, { color: t.textSecondary, marginTop: 4 }]}>
              <Text style={{ fontWeight: '700', color: t.text }}>Timing: </Text>
              {nutrition.fitnessGuidance.timing}
            </Text>
          )}
          {(nutrition.fitnessGuidance.cautions ?? []).map((c, i) => (
            <View key={i} style={styles.bullet}>
              <Ionicons name="warning-outline" size={12} color="#B45309" style={{ marginTop: 3 }} />
              <Text style={[styles.bulletText, { color: t.textSecondary }]}>{c}</Text>
            </View>
          ))}
        </View>
      )}

      {hasVitamins && (
        <View style={[styles.section, { borderTopColor: t.cardBorder }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="leaf-outline" size={14} color={t.text} />
            <Text style={[styles.sectionTitle, { color: t.text }]}>
              Supplements & vitamins
            </Text>
          </View>
          {(nutrition.vitaminEmphasis ?? []).map((v, i) => (
            <View key={i} style={styles.bullet}>
              <View style={[styles.bulletDot, { backgroundColor: t.primary }]} />
              <Text style={[styles.bulletText, { color: t.text }]}>{v}</Text>
            </View>
          ))}
        </View>
      )}

      {hasLifestyle && (
        <View style={[styles.section, { borderTopColor: t.cardBorder }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="moon-outline" size={14} color={t.text} />
            <Text style={[styles.sectionTitle, { color: t.text }]}>Lifestyle</Text>
          </View>
          {(nutrition.lifestyleNotes ?? []).map((n, i) => (
            <View key={i} style={styles.bullet}>
              <View style={[styles.bulletDot, { backgroundColor: t.primary }]} />
              <Text style={[styles.bulletText, { color: t.text }]}>{n}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.disclaimer, { color: t.textSecondary }]}>
        Educational summary. Talk to your provider before starting new
        supplements, especially if you're on prescription medications.
      </Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  subtitle: { fontSize: FontSizes.xs, marginTop: 2, lineHeight: 16 },
  section: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: { fontSize: FontSizes.xs, lineHeight: 18 },
  bullet: { flexDirection: 'row', gap: 8, marginTop: 4 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: FontSizes.xs, lineHeight: 18 },
  disclaimer: { fontSize: 10, fontStyle: 'italic', lineHeight: 14, marginTop: 4 },
});
