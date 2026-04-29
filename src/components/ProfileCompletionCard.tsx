/**
 * ProfileCompletionCard — passive nudge surfacing the user's existing
 * profile completeness score on home with a route into the missing
 * sections.
 *
 * Hides itself when score ≥ 90 (effectively done) so a complete user
 * doesn't see a permanent guilt-prompt. Also hides when score is 0
 * (brand-new install) since the Get Started flow handles that case.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { useHealthProfileStore } from '../store/useHealthProfileStore';
import { Spacing, FontSizes } from '../constants/theme';

interface MissingSection {
  label: string;
  /** Pretty human-readable description of what to add. */
  hint: string;
}

export function ProfileCompletionCard() {
  const t = useTheme();
  const router = useRouter();
  const profile = useHealthProfileStore((s) => s.profile);

  const score = profile.profileCompleteness ?? 0;

  const missing = useMemo<MissingSection[]>(() => {
    const out: MissingSection[] = [];
    if (!profile.bodyMetrics?.weightLbs || !profile.bodyMetrics?.heightInches) {
      out.push({
        label: 'Body metrics',
        hint: 'Weight + height — drives macro + dosing math',
      });
    }
    if (!profile.medical?.conditions?.length && !profile.medical?.allergies?.length) {
      out.push({
        label: 'Medical history',
        hint: 'Conditions + allergies — Aimee uses these to flag risks',
      });
    }
    if (profile.nutrition?.dietType === 'no_restriction' && !profile.nutrition?.dailyProteinGrams) {
      out.push({
        label: 'Nutrition preferences',
        hint: 'Diet type + protein target — better meal suggestions',
      });
    }
    if (!profile.sleep?.averageHours) {
      out.push({
        label: 'Sleep profile',
        hint: 'Avg hours + bedtime — improves recovery scoring',
      });
    }
    if (!profile.lifestyle?.exerciseFrequency || profile.lifestyle?.exerciseTypes?.length === 0) {
      out.push({
        label: 'Lifestyle',
        hint: 'Exercise frequency + types — sharpens workout recommendations',
      });
    }
    if (!profile.primaryGoals?.length || profile.peptideExperience === 'none') {
      out.push({
        label: 'Goals',
        hint: 'Primary goals + peptide experience — drives recommendations',
      });
    }
    return out.slice(0, 3);
  }, [profile]);

  // Hide when nothing's left to add OR when the user is brand-new
  // (the Get Started flow handles 0% better).
  if (score >= 90 || score === 0 || missing.length === 0) return null;

  const size = 64;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);
  const ringColor = score >= 60 ? '#6FA891' : '#3E7CB1';

  return (
    <GlassCard style={styles.card}>
      <View style={styles.row}>
        {/* Score ring */}
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={`${ringColor}26`}
              strokeWidth={stroke}
              fill="none"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={ringColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>
          <Text style={[styles.scoreNum, { color: t.text }]}>{score}%</Text>
        </View>

        {/* Right side */}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Finish your profile</Text>
          <Text style={[styles.body, { color: t.textSecondary }]} numberOfLines={2}>
            More data = sharper recommendations. {missing.length} section
            {missing.length === 1 ? '' : 's'} left to fill in.
          </Text>
        </View>
      </View>

      <View style={[styles.missingList, { borderTopColor: t.cardBorder }]}>
        {missing.map((m, idx) => (
          <View
            key={m.label}
            style={[
              styles.missingRow,
              idx > 0 && { borderTopWidth: 1, borderTopColor: t.cardBorder },
            ]}
          >
            <View style={styles.missingDot} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.missingLabel, { color: t.text }]}>{m.label}</Text>
              <Text style={[styles.missingHint, { color: t.textSecondary }]}>
                {m.hint}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={() => router.push('/health-profile' as any)}
        style={[styles.cta, { backgroundColor: ringColor }]}
        accessibilityRole="button"
        accessibilityLabel="Complete your health profile"
        activeOpacity={0.85}
      >
        <Text style={styles.ctaText}>Complete profile</Text>
        <Ionicons name="arrow-forward" size={14} color="#fff" />
      </TouchableOpacity>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: Spacing.sm },
  scoreNum: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3 },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  body: { fontSize: FontSizes.sm, lineHeight: 18, marginTop: 2 },
  missingList: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    marginBottom: Spacing.sm,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
  },
  missingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3E7CB1',
    marginTop: 6,
  },
  missingLabel: { fontSize: FontSizes.sm, fontWeight: '600' },
  missingHint: { fontSize: FontSizes.xs, marginTop: 2, lineHeight: 16 },
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
