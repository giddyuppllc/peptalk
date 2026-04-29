/**
 * ReadinessCard — daily 0-100 readiness composite on home dashboard.
 *
 * Pulls from getReadinessScore() which combines HRV / RHR / sleep
 * (vs the user's own baselines) and the most recent check-in mood /
 * energy / recovery rating.
 *
 * Hides itself when no inputs are available — keeps home clean for
 * users who haven't connected a watch + haven't checked in yet.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { getReadinessScore } from '../services/readinessScore';
import { Spacing, FontSizes } from '../constants/theme';

const VERDICT_COPY = {
  ready: { label: 'Ready', color: '#6FA891', tip: 'Good window for harder training or a step bump.' },
  hold:  { label: 'Hold steady', color: '#3E7CB1', tip: 'Mid-range day — match training to how you feel.' },
  recover: { label: 'Recover', color: '#B45309', tip: 'Body\'s asking for a lighter day. Sleep + hydration first.' },
} as const;

export function ReadinessCard() {
  const t = useTheme();
  const summary = useMemo(() => getReadinessScore(), []);

  if (!summary) return null;

  const verdict = VERDICT_COPY[summary.verdict];
  const size = 80;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - summary.score / 100);
  const trackColor = `${verdict.color}26`;

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
              stroke={trackColor}
              strokeWidth={stroke}
              fill="none"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={verdict.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.scoreNum, { color: t.text }]}>{summary.score}</Text>
            <Text style={[styles.scoreOf, { color: t.textSecondary }]}>/ 100</Text>
          </View>
        </View>

        {/* Right side — verdict + inputs */}
        <View style={{ flex: 1 }}>
          <View style={styles.headerRow}>
            <Ionicons name="heart-outline" size={14} color={verdict.color} />
            <Text style={[styles.label, { color: verdict.color }]}>READINESS</Text>
          </View>
          <Text style={[styles.verdict, { color: t.text }]}>{verdict.label}</Text>
          <Text style={[styles.tip, { color: t.textSecondary }]} numberOfLines={2}>
            {verdict.tip}
          </Text>
        </View>
      </View>

      {/* Per-input breakdown */}
      {summary.inputs.length > 0 && (
        <View style={[styles.inputsRow, { borderTopColor: t.cardBorder }]}>
          {summary.inputs.map((input) => (
            <View key={input.label} style={styles.inputCell}>
              <Text style={[styles.inputLabel, { color: t.textSecondary }]}>{input.label}</Text>
              <Text style={[styles.inputValue, { color: t.text }]}>{input.value}</Text>
              {input.delta && (
                <Text style={[styles.inputDelta, { color: t.textMuted }]}>{input.delta}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scoreNum: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  scoreOf: { fontSize: 9, marginTop: -2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  verdict: { fontSize: FontSizes.lg, fontWeight: '700' },
  tip: { fontSize: FontSizes.xs, lineHeight: 16, marginTop: 2 },
  inputsRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  inputCell: { flex: 1, alignItems: 'center' },
  inputLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  inputValue: { fontSize: FontSizes.sm, fontWeight: '700', marginTop: 2 },
  inputDelta: { fontSize: 10, marginTop: 1 },
});
