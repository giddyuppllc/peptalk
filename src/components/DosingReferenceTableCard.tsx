import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import {
  getDosingTableEntry,
  PEPTIDE_DOSING_TABLE_DISCLAIMER,
} from '../data/peptideDosingTable';

/**
 * Surfaces the master dosing-reference TABLE row for a peptide:
 * dosing range, cycle length, daily/weekly frequency, time off between
 * cycles, and fasted requirement. Data comes from
 * src/data/peptideDosingTable.ts (transcribed from Edward's master table).
 *
 * Research-use framing only — mirrors the rest of the app. Renders
 * nothing when the peptide has no table entry.
 */
export function DosingReferenceTableCard({ peptideId }: { peptideId: string }) {
  const entry = getDosingTableEntry(peptideId);
  if (!entry) return null;

  const rows: { label: string; value?: string; icon: string }[] = [
    { label: 'Dosing range', value: entry.dosingRange, icon: 'flask-outline' },
    { label: 'Cycle length', value: entry.cycleLength, icon: 'time-outline' },
    { label: 'Frequency (daily)', value: entry.frequencyDaily, icon: 'today-outline' },
    { label: 'Frequency (weekly)', value: entry.frequencyWeekly, icon: 'calendar-outline' },
    { label: 'Time off between cycles', value: entry.timeOffBetweenCycles, icon: 'pause-circle-outline' },
  ].filter((r) => !!r.value);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="grid-outline" size={18} color="#7ABED0" />
        <Text style={styles.title}>Dosing reference</Text>
      </View>

      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <View style={styles.rowLabelWrap}>
            <Ionicons name={r.icon as any} size={14} color="#6B7280" />
            <Text style={styles.rowLabel}>{r.label}</Text>
          </View>
          <Text style={styles.rowValue}>{r.value}</Text>
        </View>
      ))}

      {entry.fasted !== undefined && (
        <View style={styles.row}>
          <View style={styles.rowLabelWrap}>
            <Ionicons name="restaurant-outline" size={14} color="#6B7280" />
            <Text style={styles.rowLabel}>Fasted</Text>
          </View>
          <View
            style={[
              styles.fastedPill,
              { backgroundColor: entry.fasted ? '#6FA8911A' : '#9CA3AF1A' },
            ]}
          >
            <Text
              style={[
                styles.fastedPillText,
                { color: entry.fasted ? '#3F6E5A' : '#6B7280' },
              ]}
            >
              {entry.fasted ? 'Yes' : 'No'}
            </Text>
          </View>
        </View>
      )}

      {/* Titration strategy — the source table links to a separate
          "Click For Notes [n]" page. The prose isn't ingested yet, so we
          show the note reference + a pending hint rather than guessing. */}
      <View style={styles.titrationBlock}>
        <View style={styles.rowLabelWrap}>
          <Ionicons name="trending-up-outline" size={14} color="#6B7280" />
          <Text style={styles.rowLabel}>Titration strategy</Text>
        </View>
        {entry.titrationNote ? (
          <Text style={styles.titrationText}>{entry.titrationNote}</Text>
        ) : (
          <Text style={styles.titrationPending}>
            Detailed titration notes (ref [{entry.titrationNoteRef}]) coming soon.
          </Text>
        )}
      </View>

      <Text style={styles.disclaimer}>{PEPTIDE_DOSING_TABLE_DISCLAIMER}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#2D2D2D' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  rowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  rowLabel: { fontSize: 13, color: '#6B7280' },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D2D2D',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  fastedPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  fastedPillText: { fontSize: 12, fontWeight: '700' },
  titrationBlock: { marginTop: 12 },
  titrationText: { fontSize: 13, lineHeight: 19, color: '#2D2D2D', marginTop: 6 },
  titrationPending: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 6,
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 14,
  },
});
