/**
 * PeptideCyclePhaseCard — surfaces the user's current cycle phase next
 * to the peptide they're viewing, with a factual one-liner about how
 * this peptide category typically interacts with that phase.
 *
 * Hides for users without cycle tracking enabled. Uses computeCyclePhase
 * (which tolerates missing data) and a curated category × phase blurb
 * table — NOT a statistical correlation on user data, since check-ins
 * are too sparse for a reliable chart in the early days.
 *
 * The "your data" version of this card lives in PeptideTrendCard
 * (Wave 30) — that one DOES read peptide-tagged biometric trends. Both
 * cards complement each other on the peptide detail page.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes } from '../constants/theme';
import { useHealthProfileStore } from '../store/useHealthProfileStore';
import { computeCyclePhase, PHASE_LABELS, type CyclePhase } from '../services/cycleService';
import type { Peptide, PeptideCategory } from '../types';

interface PeptideCyclePhaseCardProps {
  peptide: Peptide;
}

const PHASE_COLORS: Record<CyclePhase, string> = {
  menstrual:  '#E89672',
  follicular: '#F2C7A9',
  ovulatory:  '#C76B45',
  luteal:     '#E8C9BD',
};

/**
 * Curated factual guidance — what the literature says about each
 * category's interaction with each menstrual phase. Editorial-grade,
 * not statistical claims about the individual user.
 */
const CATEGORY_PHASE_GUIDANCE: Partial<Record<PeptideCategory, Record<CyclePhase, string>>> = {
  Metabolic: {
    menstrual:
      'Cravings + water retention can spike during this phase. GLP-1s often feel stronger because baseline appetite is already elevated — track if nausea is amplified vs. baseline.',
    follicular:
      'Insulin sensitivity is typically highest in the follicular phase. Many users describe cleaner appetite suppression and easier scale-weight movement here.',
    ovulatory:
      'Estrogen peaks around ovulation; metabolic tools may feel less pronounced because natural appetite signaling is already sharp. Maintain protocol — don\'t up-titrate based on a "weaker" feel.',
    luteal:
      'Progesterone rises and water retention + cravings tend to follow. Scale weight may bump 1–3 lbs that\'s NOT fat — don\'t adjust your dose based on luteal-phase scale fluctuations.',
  },
  Recovery: {
    menstrual:
      'Iron stores dip from menstrual loss. Tissue-repair protocols (BPC-157, TB-500) may benefit from co-tracking ferritin if you\'re cycling for an injury.',
    follicular:
      'Estrogen rising → connective tissue is more pliable, recovery is generally faster. Common phase to start a recovery protocol if timing is flexible.',
    ovulatory:
      'Strength typically peaks around ovulation. Pair recovery peptides with the harder training days you can hit now.',
    luteal:
      'Body temp rises slightly and inflammation markers can run higher. Recovery may feel slower — that\'s normal cycle physiology, not the protocol failing.',
  },
  'Growth Hormone': {
    menstrual:
      'Sleep can be disrupted by cramps + temperature shifts. GH-axis peptides (sermorelin, ipamorelin) work via deep sleep — pay extra attention to sleep hygiene this phase.',
    follicular:
      'Sleep quality is typically best mid-follicular. Peak window for GH-axis protocols to actually move the needle on body comp.',
    ovulatory:
      'Slight sleep disruption around ovulation is normal. Maintain dose timing.',
    luteal:
      'Body temp +0.5°F + progesterone-driven sleep changes are common. GH pulses may feel less effective — they\'re often working fine; sleep-stage architecture is just shifted.',
  },
  Nootropic: {
    menstrual:
      'Estrogen is at its lowest. Many women report brain fog this phase. Cognitive peptides (Semax, Selank) may feel more pronounced because the contrast is bigger.',
    follicular:
      'Verbal fluency + working memory are typically sharpest here. Good phase to evaluate whether a cognitive peptide is helping.',
    ovulatory:
      'Estrogen peaks; cognitive performance is typically high regardless of supplementation. Hard to A/B test peptides this phase.',
    luteal:
      'Progesterone can blunt focus + irritability for some users. Track mood/cognitive scores carefully here.',
  },
  Reproductive: {
    menstrual: 'Hormone-axis peptides are best left to your provider during menses — cycle physiology is in transition.',
    follicular: 'Endocrine-axis manipulation is typically planned around the follicular phase. Discuss timing with your provider.',
    ovulatory: 'Hormone peaks naturally. Layered endocrine peptides may stack in unexpected ways — provider review essential.',
    luteal: 'Progesterone-dominant phase. Specialist input recommended.',
  },
};

export function PeptideCyclePhaseCard({ peptide }: PeptideCyclePhaseCardProps) {
  const t = useTheme();
  const cycle = useHealthProfileStore((s) => s.profile?.cycle);
  const biologicalSex = useHealthProfileStore((s) => s.profile?.biologicalSex);

  const phaseInfo = useMemo(() => {
    if (!cycle?.trackingEnabled) return null;
    return computeCyclePhase(
      cycle.lastPeriodStartDate,
      cycle.typicalCycleLength,
      cycle.typicalPeriodLength,
    );
  }, [cycle]);

  if (!cycle?.trackingEnabled || !phaseInfo) return null;
  if (biologicalSex && biologicalSex !== 'female') return null;

  // Pick the first matching category guidance — peptides have multiple
  // categories, but the most-clinically-relevant one is usually the first.
  const category = (peptide.categories ?? []).find((c) => CATEGORY_PHASE_GUIDANCE[c]);
  const guidance = category
    ? CATEGORY_PHASE_GUIDANCE[category]?.[phaseInfo.phase]
    : undefined;
  if (!guidance) return null;

  const phaseColor = PHASE_COLORS[phaseInfo.phase];
  const phaseLabel = PHASE_LABELS[phaseInfo.phase];

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: phaseColor + '33' }]}>
          <Ionicons name="flower-outline" size={18} color={phaseColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: phaseColor }]}>
            {phaseLabel} phase · day {phaseInfo.dayOfCycle}
          </Text>
          <Text style={[styles.title, { color: t.text }]}>
            {peptide.name} × {phaseLabel.toLowerCase()}
          </Text>
        </View>
      </View>

      <Text style={[styles.body, { color: t.text }]}>{guidance}</Text>

      <Text style={[styles.disclaimer, { color: t.textSecondary }]}>
        General research framing — your individual response varies. Track + discuss with your provider.
      </Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: { fontSize: FontSizes.md, fontWeight: '700', marginTop: 2 },
  body: { fontSize: FontSizes.sm, lineHeight: 20, marginTop: 4 },
  disclaimer: { fontSize: 10, fontStyle: 'italic', lineHeight: 14, marginTop: 6 },
});
