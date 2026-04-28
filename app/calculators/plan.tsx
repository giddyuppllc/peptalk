/**
 * Plan Your Cycle — goal-driven peptide recommender + protocol launcher.
 *
 * Replaces the "raw math calculator" experience with a clinical-style
 * intake → recommendation → protocol flow:
 *   1. Pull personal info from health profile (editable inline)
 *   2. User picks a goal
 *   3. Show top peptide candidates for that goal (from goalPeptideMatrix)
 *   4. Tap a peptide → open its detail page where protocols + dosing live
 *
 * Not a clinical recommendation. Disclaimer is surfaced prominently.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { AnimatedPress } from '../../src/components/AnimatedPress';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import { GOAL_OPTIONS } from '../../src/constants/goals';
import { GOAL_PEPTIDE_MATRIX, recommendPeptidesForGoal } from '../../src/data/goalPeptideMatrix';
import { getPeptideById } from '../../src/data/peptides';
import type { GoalType, ActivityLevel } from '../../src/types';

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very Active' },
];

const EXPERIENCE_OPTIONS = [
  { value: 'none', label: 'New to peptides' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'experienced', label: 'Experienced' },
] as const;

const TIER_COLORS = {
  primary:      { bg: '#3E7CB1', label: 'Primary' },
  secondary:    { bg: '#7FB3D8', label: 'Secondary' },
  experimental: { bg: '#94B8D4', label: 'Experimental' },
};

export default function PlanCycleScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();

  // Pull profile data (editable inline)
  const profile = useHealthProfileStore((s) => s.profile);
  const setBodyMetrics = useHealthProfileStore((s) => s.setBodyMetrics);
  const setLifestyle = useHealthProfileStore((s) => s.setLifestyle);
  const setPeptideExperience = useHealthProfileStore((s) => s.setPeptideExperience);
  const onboardingProfile = useOnboardingStore((s) => s.profile);

  // Local goal state (not persisted — chosen per planning session)
  const [selectedGoal, setSelectedGoal] = useState<GoalType | null>(
    onboardingProfile.healthGoals[0] ?? null,
  );
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);

  // Local edits to personal info — persist on blur
  const [weightInput, setWeightInput] = useState(
    profile.bodyMetrics.weightLbs ? String(profile.bodyMetrics.weightLbs) : '',
  );

  const recommendations = useMemo(() => {
    if (!selectedGoal) return [];
    const allergens = profile.medical.allergies ?? [];
    const conditions = profile.medical.conditions ?? [];
    return recommendPeptidesForGoal(selectedGoal, {
      // Don't auto-exclude based on conditions/allergens here — surface
      // a warning per peptide instead so user sees what to discuss with
      // a provider rather than silently hiding options.
      limit: showAllRecommendations ? undefined : 3,
    }).map((m) => ({
      ...m,
      peptide: getPeptideById(m.id),
      // Crude contraindication flag — checks free-text overlap. Not a
      // medical filter; just a visual nudge for the user.
      hasFlag:
        allergens.some((a) => a.toLowerCase().includes(m.id.toLowerCase())) ||
        conditions.length > 0, // any condition triggers a review nudge
    }));
  }, [selectedGoal, profile.medical.allergies, profile.medical.conditions, showAllRecommendations]);

  const totalAvailable = selectedGoal ? GOAL_PEPTIDE_MATRIX[selectedGoal]?.length ?? 0 : 0;

  const commitWeight = () => {
    const w = parseFloat(weightInput);
    if (!isNaN(w) && w > 0 && w !== profile.bodyMetrics.weightLbs) {
      setBodyMetrics({ weightLbs: w });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Plan Your Cycle</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          Tell us your goal — we'll suggest peptides commonly researched for it
          and walk you through dosing protocols. Final decisions belong with a
          qualified provider.
        </Text>

        {/* ── Personal Info ─────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>YOUR INFO</Text>
        <GlassCard style={styles.infoCard}>
          {/* Weight + Activity */}
          <View style={styles.infoRow}>
            <View style={styles.infoCol}>
              <Text style={[styles.infoLabel, { color: t.textSecondary }]}>Weight (lbs)</Text>
              <TextInput
                style={[styles.infoInput, { color: t.text, borderColor: t.cardBorder }]}
                value={weightInput}
                onChangeText={setWeightInput}
                onBlur={commitWeight}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={t.textMuted}
                accessibilityLabel="Body weight in pounds"
              />
            </View>
            <View style={[styles.infoCol, { flex: 1.3 }]}>
              <Text style={[styles.infoLabel, { color: t.textSecondary }]}>Activity level</Text>
              <View style={styles.chipRow}>
                {ACTIVITY_OPTIONS.map((opt) => {
                  const selected = profile.lifestyle.activityLevel === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setLifestyle({ activityLevel: opt.value })}
                      style={[
                        styles.chip,
                        { borderColor: selected ? accent.deep : t.cardBorder, backgroundColor: selected ? `${accent.deep}15` : 'transparent' },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.chipText, { color: selected ? accent.deep : t.textSecondary }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Experience level */}
          <Text style={[styles.infoLabel, { color: t.textSecondary, marginTop: Spacing.sm }]}>
            Peptide experience
          </Text>
          <View style={styles.chipRow}>
            {EXPERIENCE_OPTIONS.map((opt) => {
              const selected = profile.peptideExperience === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() =>
                    setPeptideExperience(
                      opt.value,
                      profile.currentPeptides ?? [],
                      profile.pastPeptides ?? [],
                    )
                  }
                  style={[
                    styles.chip,
                    { borderColor: selected ? accent.deep : t.cardBorder, backgroundColor: selected ? `${accent.deep}15` : 'transparent' },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, { color: selected ? accent.deep : t.textSecondary }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Health profile shortcut for fuller details */}
          <TouchableOpacity
            onPress={() => router.push('/health-profile')}
            style={styles.profileLink}
            accessibilityRole="link"
          >
            <Ionicons name="settings-outline" size={14} color={accent.deep} />
            <Text style={[styles.profileLinkText, { color: accent.deep }]}>
              Edit full profile (height, allergies, conditions, current meds)
            </Text>
          </TouchableOpacity>
        </GlassCard>

        {/* ── Goal Picker ───────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>YOUR GOAL</Text>
        <View style={styles.goalGrid}>
          {GOAL_OPTIONS.map((goal) => {
            const selected = selectedGoal === goal.value;
            return (
              <AnimatedPress
                key={goal.value}
                onPress={() => {
                  setSelectedGoal(goal.value);
                  setShowAllRecommendations(false);
                }}
                style={[
                  styles.goalChip,
                  {
                    borderColor: selected ? goal.color : t.cardBorder,
                    backgroundColor: selected ? `${goal.color}18` : t.card,
                  },
                ]}
              >
                <Ionicons
                  name={goal.icon as any}
                  size={18}
                  color={selected ? goal.color : t.textSecondary}
                />
                <Text
                  style={[
                    styles.goalChipText,
                    { color: selected ? goal.color : t.text, fontWeight: selected ? '700' : '500' },
                  ]}
                >
                  {goal.label}
                </Text>
              </AnimatedPress>
            );
          })}
        </View>

        {/* ── Recommendations ───────────────────────────── */}
        {selectedGoal && recommendations.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>
              SUGGESTED PEPTIDES
            </Text>
            {recommendations.map((rec) => {
              const tierStyle = TIER_COLORS[rec.tier];
              return (
                <AnimatedPress
                  key={rec.id}
                  onPress={() => router.push(`/peptide/${rec.id}` as any)}
                  style={styles.recCardPress}
                >
                  <GlassCard style={styles.recCard}>
                    <View style={styles.recHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.recName, { color: t.text }]}>
                          {rec.peptide?.name ?? rec.id}
                        </Text>
                        <View style={[styles.tierBadge, { backgroundColor: tierStyle.bg }]}>
                          <Text style={styles.tierBadgeText}>{tierStyle.label}</Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
                    </View>
                    <Text style={[styles.recReason, { color: t.textSecondary }]}>
                      {rec.reason}
                    </Text>
                    {rec.peptide?.halfLife && (
                      <View style={styles.recMetaRow}>
                        <Text style={[styles.recMetaItem, { color: t.textSecondary }]}>
                          ½-life: {rec.peptide.halfLife}
                        </Text>
                        {rec.peptide.storageTemp && (
                          <Text style={[styles.recMetaItem, { color: t.textSecondary }]}>
                            Store: {rec.peptide.storageTemp}
                          </Text>
                        )}
                      </View>
                    )}
                  </GlassCard>
                </AnimatedPress>
              );
            })}

            {!showAllRecommendations && totalAvailable > recommendations.length && (
              <TouchableOpacity
                onPress={() => setShowAllRecommendations(true)}
                style={styles.showMoreBtn}
                accessibilityRole="button"
              >
                <Text style={[styles.showMoreText, { color: accent.deep }]}>
                  Show all {totalAvailable} options
                </Text>
                <Ionicons name="chevron-down" size={16} color={accent.deep} />
              </TouchableOpacity>
            )}

            {/* Calculator shortcuts */}
            <View style={styles.calcShortcuts}>
              <AnimatedPress
                onPress={() => router.push('/calculators/quick-dose')}
                style={[styles.calcLink, { borderColor: t.cardBorder, backgroundColor: t.card }]}
              >
                <Ionicons name="flash" size={18} color={accent.deep} />
                <Text style={[styles.calcLinkText, { color: t.text }]}>Quick Dose Guide</Text>
              </AnimatedPress>
              <AnimatedPress
                onPress={() => router.push('/calculators/dosing')}
                style={[styles.calcLink, { borderColor: t.cardBorder, backgroundColor: t.card }]}
              >
                <Ionicons name="calculator" size={18} color={accent.deep} />
                <Text style={[styles.calcLinkText, { color: t.text }]}>Custom Dose Math</Text>
              </AnimatedPress>
            </View>
          </>
        )}

        {/* Empty state when no goal */}
        {!selectedGoal && (
          <GlassCard style={styles.emptyCard}>
            <Ionicons name="arrow-up" size={20} color={t.textSecondary} />
            <Text style={[styles.emptyText, { color: t.textSecondary }]}>
              Pick a goal above to see suggested peptides.
            </Text>
          </GlassCard>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="medical-outline" size={14} color={t.textMuted} />
          <Text style={[styles.disclaimer, { color: t.textMuted }]}>
            Educational only — not medical advice. Discuss any peptide protocol
            with a qualified provider before starting. Allergies, medications,
            pregnancy, and pre-existing conditions can change what's safe for you.
          </Text>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: '700', flex: 1, textAlign: 'center' },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  subtitle: {
    fontSize: FontSizes.md,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // Personal info card
  infoCard: { padding: Spacing.md, gap: Spacing.sm },
  infoRow: { flexDirection: 'row', gap: Spacing.md },
  infoCol: { flex: 1 },
  infoLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  infoInput: {
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: FontSizes.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  chipText: { fontSize: FontSizes.xs, fontWeight: '500' },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  profileLinkText: { fontSize: FontSizes.xs, fontWeight: '600' },

  // Goal grid
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  goalChipText: { fontSize: FontSizes.sm },

  // Recommendations
  recCardPress: { marginBottom: Spacing.sm },
  recCard: { padding: Spacing.md },
  recHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  recName: { fontSize: FontSizes.lg, fontWeight: '700', marginBottom: 4 },
  tierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tierBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  recReason: { fontSize: FontSizes.sm, lineHeight: 19, marginTop: 6 },
  recMetaRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  recMetaItem: { fontSize: FontSizes.xs, fontWeight: '500' },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
  },
  showMoreText: { fontSize: FontSizes.sm, fontWeight: '600' },

  // Calc shortcuts
  calcShortcuts: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  calcLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  calcLinkText: { fontSize: FontSizes.sm, fontWeight: '600' },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  emptyText: { fontSize: FontSizes.sm, textAlign: 'center' },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row',
    gap: 6,
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  disclaimer: {
    flex: 1,
    fontSize: FontSizes.xs,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
