/**
 * ProtocolPlanCard — goal-aware protocol summary that pulls everything
 * the user needs to plan a cycle into one card:
 *
 *   - Recommended per-injection dose (from protocol typicalDose range)
 *   - Frequency (from protocol)
 *   - Cycle length (from protocol durationWeeks)
 *   - Total dose over the cycle (computed)
 *   - Vials needed for the cycle (computed when vialMcg is known)
 *   - Goal-specific cycling / off-period guidance
 *   - The most-relevant best-practice note
 *
 * Slots into the dosing calculator beneath the existing PeptideGuide so
 * the user sees the protocol math + best practices in one place. Goal is
 * read from the user's health profile (primaryGoals[0]) so the framing
 * matches their actual reason for using the peptide.
 *
 * Doses are presented as ranges (low end → high end) — these are
 * informational summaries of published research, not prescriptions.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { useHealthProfileStore } from '../store/useHealthProfileStore';
import { Spacing, FontSizes } from '../constants/theme';
import type { Peptide, ProtocolTemplate, GoalType, ProtocolFrequency } from '../types';
import {
  type ProtocolIntensity,
  intensityToDoseRangeMcg,
} from './ProtocolIntensityPicker';

interface ProtocolPlanCardProps {
  peptide: Peptide;
  protocol: ProtocolTemplate;
  /** Optional vial concentration in mcg — when provided, the card shows
   *  exact vials needed. Without it, only total-dose figures show. */
  vialMcg?: number;
  /** Override the goal pulled from the health profile. */
  goal?: GoalType | null;
  /** Mild / Standard / Aggressive — shifts the dose range used for the
   *  cycle math. Defaults to Standard (full typical range) when omitted. */
  intensity?: ProtocolIntensity;
}

const FREQUENCY_PER_WEEK: Record<ProtocolFrequency, number> = {
  daily:        7,
  twice_daily:  14,
  eod:          3.5,
  tiw:          3,
  biw:          2,
  weekly:       1,
  biweekly:     0.5,
  monthly:      0.25,
  custom:       1,
};

const GOAL_LABELS: Record<GoalType, string> = {
  weight_loss:       'Weight loss',
  muscle_gain:       'Muscle gain',
  body_recomp:       'Body recomposition',
  recovery:          'Recovery',
  longevity:         'Longevity',
  cognitive:         'Cognitive',
  sleep:             'Sleep',
  energy:            'Energy',
  immune:            'Immune support',
  gut_health:        'Gut health',
  skin_hair:         'Skin / hair',
  hormonal:          'Hormonal',
  general_wellness:  'General wellness',
};

/**
 * Goal-specific cycling guidance. Keys map to the goal types that have
 * sensible best-practice cycles; everything else falls through to the
 * generic protocol range. Conservative on cycle counts — these are
 * informational defaults, not personalized prescriptions.
 */
const GOAL_CYCLE_GUIDANCE: Partial<Record<GoalType, string>> = {
  weight_loss:
    'Plan a 4-week off-cycle after each run to preserve receptor sensitivity. GLP-1s are typically run continuously while titrating up to maintenance.',
  muscle_gain:
    'Run 8–12 weeks at the upper dose, then cycle off 4 weeks before restarting. Pair with progressive resistance training and ≥1.6 g protein/kg/day.',
  body_recomp:
    'Sequential cycles: 8 weeks at maintenance dose, 4 weeks off. Track waist + lean mass — recomp is slower than pure cuts or bulks.',
  recovery:
    'Use for acute recovery windows: 4–6 weeks during rehab, then off. Don\'t run continuously — body adapts and effect blunts.',
  longevity:
    'Pulse-cycle: 4–6 weeks on, 4–6 weeks off, 2–3 cycles per year. Continuous use is rarely supported by the underlying research.',
  cognitive:
    '4–8 week cycles followed by a 2–4 week break. Stack with adequate sleep + creatine for synergy on cognitive endpoints.',
  hormonal:
    'GH-axis peptides: cycle 8–12 weeks on, 4 weeks off. Pituitary down-regulation accumulates with extended runs.',
};

function formatDose(mcg: number): string {
  if (mcg >= 1000) return `${(mcg / 1000).toFixed(mcg >= 10000 ? 1 : 2)} mg`;
  return `${Math.round(mcg)} mcg`;
}

function formatRange(min: number, max: number): string {
  if (min === max) return formatDose(min);
  return `${formatDose(min)}–${formatDose(max)}`;
}

export function ProtocolPlanCard({ peptide, protocol, vialMcg, goal, intensity }: ProtocolPlanCardProps) {
  const t = useTheme();
  const profileGoal = useHealthProfileStore((s) => s.profile?.primaryGoals?.[0]);
  const effectiveGoal = goal ?? profileGoal ?? null;

  const summary = useMemo(() => {
    const { durationWeeks, frequency } = protocol;
    // Intensity shifts the dose range — Mild = lower 1/3, Standard = full,
    // Aggressive = upper 1/3 of the published typical range. Standard is
    // the default when no intensity is set so existing call sites are
    // unchanged.
    const range = intensityToDoseRangeMcg(protocol, intensity ?? 'standard');
    const minMcg = range.min;
    const maxMcg = range.max;
    const perWeek = FREQUENCY_PER_WEEK[frequency] ?? 1;
    const totalInjMin = perWeek * durationWeeks.min;
    const totalInjMax = perWeek * durationWeeks.max;
    const totalMcgMin = minMcg * totalInjMin;
    const totalMcgMax = maxMcg * totalInjMax;
    const vialsMin = vialMcg && vialMcg > 0 ? Math.ceil(totalMcgMin / vialMcg) : null;
    const vialsMax = vialMcg && vialMcg > 0 ? Math.ceil(totalMcgMax / vialMcg) : null;
    return {
      perDoseLabel: formatRange(minMcg, maxMcg),
      totalDoseLabel: formatRange(totalMcgMin, totalMcgMax),
      vialsLabel:
        vialsMin != null && vialsMax != null
          ? vialsMin === vialsMax ? `${vialsMin} vial${vialsMin === 1 ? '' : 's'}` : `${vialsMin}–${vialsMax} vials`
          : null,
      injectionCountLabel:
        totalInjMin === totalInjMax
          ? `${Math.round(totalInjMin)} injections`
          : `${Math.round(totalInjMin)}–${Math.round(totalInjMax)} injections`,
      weeksLabel:
        durationWeeks.min === durationWeeks.max
          ? `${durationWeeks.min} weeks`
          : `${durationWeeks.min}–${durationWeeks.max} weeks`,
    };
  }, [protocol, vialMcg, intensity]);

  const guidance = effectiveGoal ? GOAL_CYCLE_GUIDANCE[effectiveGoal] : undefined;
  const topNote = protocol.importantNotes?.[0];

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: t.primary + '22' }]}>
          <Ionicons name="layers-outline" size={18} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Cycle plan</Text>
          {effectiveGoal ? (
            <Text style={[styles.subtitle, { color: t.textSecondary }]}>
              For {GOAL_LABELS[effectiveGoal].toLowerCase()} · {peptide.name}
            </Text>
          ) : (
            <Text style={[styles.subtitle, { color: t.textSecondary }]}>
              Typical research protocol · {peptide.name}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.statGrid, { borderTopColor: t.cardBorder, borderBottomColor: t.cardBorder }]}>
        <Stat label="Per dose" value={summary.perDoseLabel} t={t} />
        <Stat label="Frequency" value={protocol.frequencyLabel} t={t} small />
        <Stat label="Cycle" value={summary.weeksLabel} t={t} />
        <Stat label="Injections" value={summary.injectionCountLabel} t={t} />
        <Stat label="Total dose" value={summary.totalDoseLabel} t={t} />
        {summary.vialsLabel && (
          <Stat label="Vials needed" value={summary.vialsLabel} t={t} highlight />
        )}
      </View>

      {guidance && (
        <View style={[styles.guidanceRow, { borderColor: t.cardBorder }]}>
          <Ionicons name="repeat-outline" size={14} color={t.primary} style={{ marginTop: 2 }} />
          <Text style={[styles.guidanceText, { color: t.text }]}>
            {guidance}
          </Text>
        </View>
      )}

      {topNote && (
        <View style={[styles.guidanceRow, { borderColor: t.cardBorder }]}>
          <Ionicons name="bulb-outline" size={14} color={t.textSecondary} style={{ marginTop: 2 }} />
          <Text style={[styles.guidanceText, { color: t.textSecondary }]}>
            {topNote}
          </Text>
        </View>
      )}

      {!summary.vialsLabel && (
        <Text style={[styles.hint, { color: t.textSecondary }]}>
          Enter a vial size + BAC water above to see how many vials cover this cycle.
        </Text>
      )}
    </GlassCard>
  );
}

interface StatProps {
  label: string;
  value: string;
  t: ReturnType<typeof useTheme>;
  small?: boolean;
  highlight?: boolean;
}

function Stat({ label, value, t, small, highlight }: StatProps) {
  return (
    <View style={[styles.statCell, highlight && { backgroundColor: t.primary + '12' }]}>
      <Text style={[styles.statLabel, { color: t.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          styles.statValue,
          { color: highlight ? t.primary : t.text, fontSize: small ? FontSizes.sm : FontSizes.md },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.sm },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  subtitle: { fontSize: FontSizes.xs, marginTop: 2 },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  statCell: {
    width: '50%',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: { fontWeight: '700' },
  guidanceRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: Spacing.sm,
  },
  guidanceText: {
    flex: 1,
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  hint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
  },
});
