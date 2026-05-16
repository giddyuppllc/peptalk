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
import { AskAimeeButton } from './AskAimeeButton';
import { useTheme } from '../hooks/useTheme';
import { getReadinessScore } from '../services/readinessScore';
import { Spacing, FontSizes } from '../constants/theme';

const VERDICT_COPY = {
  ready: { label: 'Ready', color: '#6FA891', tip: 'Good window for harder training or a step bump.' },
  hold:  { label: 'Hold steady', color: '#3E7CB1', tip: 'Mid-range day — match training to how you feel.' },
  recover: { label: 'Recover', color: '#B45309', tip: 'Body\'s asking for a lighter day. Sleep + hydration first.' },
} as const;

// ─── Plain-English reads per metric ───────────────────────────────────
// Inputs come back with a `delta` string like "+8% vs 30d" / "-12% vs 7d" /
// "flat vs 30d". We parse the leading sign to bucket each metric into a
// traffic-light read (green / yellow / red) plus a one-liner so the UI
// is "metric · what it means today" rather than a bare number.
type ReadLevel = 'green' | 'yellow' | 'red';

function parseDeltaPct(delta?: string): number | null {
  if (!delta) return null;
  if (/flat/i.test(delta)) return 0;
  const match = delta.match(/(-?\+?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  // Encode "+8%" as 8, "-12%" as -12. Sign in raw delta carries direction.
  return delta.includes('-') ? -Math.abs(num) : num;
}

// Higher-is-better metrics: HRV, Sleep. Lower-is-better: Resting HR.
// 5% delta is the "noise" band; anything inside that is yellow.
function readForMetric(label: string, delta?: string): { level: ReadLevel; phrase: string } {
  const pct = parseDeltaPct(delta);
  if (pct == null) {
    return { level: 'yellow', phrase: 'no baseline yet' };
  }
  const lowerIsBetter = /resting hr|rhr/i.test(label);
  const direction = lowerIsBetter ? -pct : pct;

  if (label === 'HRV') {
    if (direction > 5) return { level: 'green', phrase: 'nervous system in a good place' };
    if (direction < -5) return { level: 'red', phrase: 'nervous system stressed today' };
    return { level: 'yellow', phrase: 'in your normal range' };
  }
  if (/resting hr/i.test(label)) {
    if (direction > 5) return { level: 'green', phrase: 'heart well recovered' };
    if (direction < -5) return { level: 'red', phrase: 'heart still working hard' };
    return { level: 'yellow', phrase: 'in your normal range' };
  }
  if (label === 'Sleep') {
    if (direction > 5) return { level: 'green', phrase: 'solid night' };
    if (direction < -10) return { level: 'red', phrase: 'short night — protect recovery' };
    if (direction < -5) return { level: 'yellow', phrase: 'a little short' };
    return { level: 'yellow', phrase: 'about your usual' };
  }
  if (/self-rating/i.test(label)) {
    // delta isn't typed for self-rating, fall through to neutral
    return { level: 'yellow', phrase: 'how you felt today' };
  }
  return { level: 'yellow', phrase: 'in range' };
}

const READ_COLOR: Record<ReadLevel, string> = {
  green: '#6FA891',
  yellow: '#B58A39',
  red: '#B45309',
};

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
            <View style={{ flex: 1 }} />
            {/* Icon-only Ask Aimee — small footprint, fits in the
                header row without crowding the verdict copy. */}
            <AskAimeeButton
              variant="icon"
              prefill="What does my readiness mean today?"
              accessibilityLabel="Ask Aimee what your readiness means today"
            />
          </View>
          <Text style={[styles.verdict, { color: t.text }]}>{verdict.label}</Text>
          <Text style={[styles.tip, { color: t.textSecondary }]} numberOfLines={2}>
            {verdict.tip}
          </Text>
        </View>
      </View>

      {/* Per-input breakdown — each metric pairs the number with a
          plain-English read derived from the delta vs baseline. The
          read color follows traffic-light semantics so the user can
          glance at the dot color and know if it's good/neutral/bad. */}
      {summary.inputs.length > 0 && (
        <View style={[styles.inputsCol, { borderTopColor: t.cardBorder }]}>
          {summary.inputs.map((input) => {
            const read = readForMetric(input.label, input.delta);
            const readColor = READ_COLOR[read.level];
            return (
              <View key={input.label} style={styles.inputRow}>
                <View style={[styles.readDot, { backgroundColor: readColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLine, { color: t.text }]}>
                    <Text style={styles.inputLabelInline}>{input.label}: </Text>
                    <Text style={styles.inputValueInline}>{input.value}</Text>
                    <Text style={[styles.inputPhraseInline, { color: readColor }]}> · {read.phrase}</Text>
                  </Text>
                  {input.delta && (
                    <Text style={[styles.inputDelta, { color: t.textMuted }]}>{input.delta}</Text>
                  )}
                </View>
              </View>
            );
          })}
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
  inputsCol: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  readDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  inputLine: {
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  inputLabelInline: { fontWeight: '700' },
  inputValueInline: { fontWeight: '600' },
  inputPhraseInline: { fontWeight: '600' },
  inputDelta: { fontSize: 10, marginTop: 1, fontStyle: 'italic' },
});
