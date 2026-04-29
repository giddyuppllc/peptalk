/**
 * ActiveProtocolBanner — surfaces the user's most-recent active protocol
 * with cycle progress + next-dose hint.
 *
 * Shows on the home dashboard so users see at a glance:
 *   "You're on Day 12 of Tirzepatide · next dose Friday · 8 weeks remaining"
 *
 * If the protocol has a titrationSchedule, the banner shows which step
 * the user is currently on so they know when to bump.
 *
 * Hidden entirely when no protocol is active — keeps the home screen
 * clean for free / new users.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { getPeptideById } from '../data/peptides';
import { PROTOCOL_TEMPLATES } from '../data/protocols';
import { Spacing, FontSizes, BorderRadius } from '../constants/theme';
import type { ProtocolFrequency } from '../types';

const FREQUENCY_DAYS_PER_DOSE: Record<ProtocolFrequency, number> = {
  daily: 1,
  twice_daily: 0.5,
  eod: 2,
  tiw: 7 / 3,
  biw: 7 / 2,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  custom: 1,
};

function dayDiff(from: string, to: string): number {
  const a = new Date(from + 'T12:00:00').getTime();
  const b = new Date(to + 'T12:00:00').getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function ActiveProtocolBanner() {
  const t = useTheme();
  const router = useRouter();
  const protocols = useDoseLogStore((s) => s.protocols);
  const doses = useDoseLogStore((s) => s.doses);

  const active = useMemo(
    () => protocols.find((p) => p.isActive),
    [protocols],
  );

  const info = useMemo(() => {
    if (!active) return null;
    const peptide = getPeptideById(active.peptideId);
    const template = active.templateId
      ? PROTOCOL_TEMPLATES.find((tp) => tp.id === active.templateId)
      : undefined;

    const today = new Date().toISOString().slice(0, 10);
    const dayOfCycle = active.startDate ? Math.max(1, dayDiff(active.startDate, today) + 1) : 1;
    const weekOfCycle = Math.ceil(dayOfCycle / 7);

    // Find current titration step
    let currentStep = template?.titrationSchedule?.[0];
    if (template?.titrationSchedule) {
      currentStep = template.titrationSchedule.find(
        (s) => weekOfCycle >= s.weekStart && (s.weekEnd == null || weekOfCycle <= s.weekEnd),
      ) ?? template.titrationSchedule[template.titrationSchedule.length - 1];
    }

    // Time-since-last-dose in days
    const lastDoseEntry = doses
      .filter((d) => d.peptideId === active.peptideId)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const daysSinceLastDose = lastDoseEntry ? dayDiff(lastDoseEntry.date, today) : null;

    // Days until next dose based on frequency
    const cadenceDays = FREQUENCY_DAYS_PER_DOSE[active.frequency] ?? 1;
    let nextDoseHint: string | null = null;
    if (daysSinceLastDose != null) {
      const daysUntilNext = Math.max(0, Math.ceil(cadenceDays - daysSinceLastDose));
      if (daysUntilNext === 0) nextDoseHint = 'Dose due today';
      else if (daysUntilNext === 1) nextDoseHint = 'Next dose tomorrow';
      else nextDoseHint = `Next dose in ${daysUntilNext} days`;
    } else {
      // No doses logged yet
      nextDoseHint = 'Log your first dose';
    }

    // Cycle window (if template has durationWeeks)
    let weeksRemaining: number | null = null;
    if (template?.durationWeeks?.max) {
      weeksRemaining = Math.max(0, template.durationWeeks.max - weekOfCycle + 1);
    }

    return {
      peptide,
      template,
      dayOfCycle,
      weekOfCycle,
      currentStep,
      nextDoseHint,
      weeksRemaining,
    };
  }, [active, doses]);

  if (!active || !info) return null;

  const peptideName = info.peptide?.name ?? active.peptideId;
  const stepLabel = info.currentStep
    ? `${info.currentStep.dose} ${info.currentStep.unit} ${info.currentStep.frequencyLabel.toLowerCase()}`
    : `${active.dose} ${active.unit}`;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => router.push('/(tabs)/calendar' as any)}
      accessibilityRole="button"
      accessibilityLabel={`Active protocol: ${peptideName}, day ${info.dayOfCycle}, ${info.nextDoseHint}`}
    >
      <LinearGradient
        colors={['#3E7CB1', '#7FB3D8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="flask" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            Day {info.dayOfCycle} · {peptideName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {stepLabel}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {info.nextDoseHint}
            {info.weeksRemaining != null && info.weeksRemaining > 0
              ? ` · ${info.weeksRemaining}w left`
              : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.85)" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  subtitle: {
    color: '#fff',
    fontSize: FontSizes.xs,
    fontWeight: '600',
    marginTop: 1,
    opacity: 0.95,
  },
  meta: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
});
