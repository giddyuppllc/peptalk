/**
 * TitrationScheduleCard — renders a structured week-by-week dose ladder
 * for a protocol that has `titrationSchedule` populated. Mirrors the
 * ladder format used by peptidedosagescalculator.com / FDA labels.
 *
 * Falls back to null (caller should hide its section) when the protocol
 * is constant-dose (no titrationSchedule).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSizes, BorderRadius } from '../constants/theme';
import type { TitrationStep, ProtocolTemplate } from '../types';

interface Props {
  protocol: ProtocolTemplate;
}

function formatStepRange(step: TitrationStep): string {
  if (!step.weekEnd) return `Week ${step.weekStart}+`;
  if (step.weekEnd === step.weekStart) return `Week ${step.weekStart}`;
  return `Week ${step.weekStart}–${step.weekEnd}`;
}

function formatDose(step: TitrationStep): string {
  // Render mcg as mg when ≥1000 for readability — peptidedosagescalculator
  // shows "1 mg" not "1000 mcg" on the maintenance steps.
  if (step.unit === 'mcg' && step.dose >= 1000) {
    const mg = step.dose / 1000;
    const formatted = Number.isInteger(mg) ? mg : Number(mg.toFixed(2));
    return `${formatted} mg`;
  }
  return `${step.dose} ${step.unit}`;
}

export function TitrationScheduleCard({ protocol }: Props) {
  const t = useTheme();
  const schedule = protocol.titrationSchedule;
  if (!schedule || schedule.length === 0) return null;

  const totalWeeks = schedule[schedule.length - 1].weekEnd
    ?? schedule[schedule.length - 1].weekStart;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="trending-up" size={18} color={t.text} />
        <Text style={[styles.title, { color: t.text }]}>Titration ladder</Text>
        <View style={styles.spacer} />
        <Text style={[styles.totalLabel, { color: t.textSecondary }]}>
          ~{totalWeeks}+ weeks
        </Text>
      </View>

      <View style={[styles.tableHeader, { borderBottomColor: t.cardBorder }]}>
        <Text style={[styles.colWeek, styles.colHeader, { color: t.textSecondary }]}>WEEK</Text>
        <Text style={[styles.colDose, styles.colHeader, { color: t.textSecondary }]}>DOSE</Text>
        <Text style={[styles.colFreq, styles.colHeader, { color: t.textSecondary }]}>FREQUENCY</Text>
      </View>

      {schedule.map((step, idx) => {
        const isFinal = idx === schedule.length - 1;
        return (
          <View key={`${step.weekStart}-${step.dose}`}>
            <View
              style={[
                styles.row,
                idx > 0 && { borderTopWidth: 1, borderTopColor: t.cardBorder },
                isFinal && { backgroundColor: `${t.text}06` },
              ]}
            >
              <Text style={[styles.colWeek, styles.cell, { color: t.text }]}>
                {formatStepRange(step)}
              </Text>
              <Text style={[styles.colDose, styles.cell, styles.doseCell, { color: t.text }]}>
                {formatDose(step)}
              </Text>
              <Text style={[styles.colFreq, styles.cell, { color: t.textSecondary }]}>
                {step.frequencyLabel}
              </Text>
            </View>
            {step.note && (
              <View style={styles.noteRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={13}
                  color={t.textSecondary}
                  style={{ marginTop: 2 }}
                />
                <Text style={[styles.noteText, { color: t.textSecondary }]}>{step.note}</Text>
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.disclaimer}>
        <Ionicons name="medical-outline" size={12} color={t.textMuted} />
        <Text style={[styles.disclaimerText, { color: t.textMuted }]}>
          Reference titration. Provider may hold a step longer if side-effects
          haven't settled, or adjust based on response. Not medical advice.
        </Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md, marginVertical: Spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  spacer: { flex: 1 },
  totalLabel: { fontSize: FontSizes.xs, fontWeight: '600' },

  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  colHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  cell: { fontSize: FontSizes.sm },
  doseCell: { fontWeight: '700' },
  colWeek: { width: 110 },
  colDose: { width: 80 },
  colFreq: { flex: 1 },

  noteRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  noteText: { fontSize: FontSizes.xs, lineHeight: 16, flex: 1 },

  disclaimer: {
    flexDirection: 'row',
    gap: 4,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  disclaimerText: {
    flex: 1,
    fontSize: FontSizes.xs,
    lineHeight: 14,
    fontStyle: 'italic',
  },
});
