/**
 * Cycle dashboard — main cycle tab entry.
 *
 * Layout varies by prediction mode:
 *   - cyclical / scheduled_cycle: full wheel + phase + next period + fertile window
 *   - continuous / returning / irregular: symptom-tracking focused, no predictions
 *   - pregnancy: gestational week card (future — stubbed for now)
 *
 * Noah's UI spec: Cloud Dancer cream, glass cards, peach/rose for feminine
 * accents on female profiles. Soft, not sterile.
 */

import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useCycleStore } from '../../src/store/useCycleStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import {
  CONTRACEPTION_LABELS,
  predictionModeFor,
  type PredictionMode,
} from '../../src/types/cycle';
import { rescheduleCycleNotifications } from '../../src/services/cycleNotifications';
import {
  computeCyclePrediction,
  computeCycleStats,
} from '../../src/services/cyclePredictor';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00Z').getTime();
  const db = new Date(b + 'T12:00:00Z').getTime();
  return Math.round((db - da) / (24 * 3600 * 1000));
}

const WHEEL_SIZE = 260;
const WHEEL_STROKE = 14;
const WHEEL_RADIUS = (WHEEL_SIZE - WHEEL_STROKE) / 2;

const PHASE_COLORS = {
  menstrual:  '#E89672',
  follicular: '#F0CFB1',
  ovulatory:  '#C76B45',
  luteal:     '#E8C9BD',
};

export default function CycleDashboard() {
  const router = useRouter();
  const t = useTheme();

  // CRITICAL: select stable inputs from the store (arrays + primitive
  // returns from .find()), then compute derived values via useMemo. The
  // previous pattern — useCycleStore(s => s.getStats()) — returned a
  // fresh object every selector call which Zustand's === check treated
  // as a state change, triggering an infinite render loop and the
  // "Maximum update depth exceeded" crash on TestFlight.
  const periods = useCycleStore((s) => s.periods);
  const contraceptionHistory = useCycleStore((s) => s.contraceptionHistory);
  const dayLogs = useCycleStore((s) => s.dayLogs);
  const tracking = useHealthProfileStore((s) => s.profile?.cycle);

  const currentContraception = useMemo(
    () => contraceptionHistory.find((h) => !h.endDate),
    [contraceptionHistory],
  );
  const activePeriod = useMemo(
    () => periods.find((p) => !p.endDate),
    [periods],
  );
  const mostRecent = useMemo(() => {
    if (periods.length === 0) return undefined;
    return [...periods].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  }, [periods]);
  const dayLog = useMemo(() => {
    const today = todayKey();
    return dayLogs.find((d) => d.date === today);
  }, [dayLogs]);

  const prediction = useMemo(
    () =>
      computeCyclePrediction({
        method: currentContraception?.method ?? 'tracking_natural',
        periods,
        fallbackCycleLength: tracking?.typicalCycleLength,
        fallbackPeriodLength: tracking?.typicalPeriodLength,
      }),
    [
      currentContraception?.method,
      periods,
      tracking?.typicalCycleLength,
      tracking?.typicalPeriodLength,
    ],
  );
  const stats = useMemo(() => computeCycleStats(periods), [periods]);

  // Refresh predictive cycle notifications whenever the inputs that drive
  // predictions change (current contraception, latest period, prediction
  // result). Mode-aware via predictionModeFor — non-predictive modes will
  // sweep existing reminders without scheduling new ones.
  useEffect(() => {
    if (!tracking?.trackingEnabled) return;
    const mode = currentContraception
      ? predictionModeFor(currentContraception.method)
      : 'cyclical';
    rescheduleCycleNotifications(mode, prediction).catch(() => {
      // Notifications are best-effort; failures shouldn't surface to the user.
    });
  }, [
    tracking?.trackingEnabled,
    currentContraception?.method,
    prediction?.nextPeriodDate,
    prediction?.ovulationDate,
    prediction?.pmsWindow?.start,
  ]);

  // If not set up yet, nudge to setup
  if (!tracking?.trackingEnabled) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: t.text }]}>Cycle</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconCircle, { backgroundColor: t.primary + '22' }]}>
            <Ionicons name="flower-outline" size={36} color={t.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: t.text }]}>Set up cycle tracking</Text>
          <Text style={[styles.emptyBody, { color: t.textSecondary }]}>
            A few questions about your situation so the predictions and insights you see are
            actually accurate — not generic.
          </Text>
          <View style={{ width: '100%', paddingHorizontal: 32, marginTop: 20 }}>
            <GradientButton
              label="Get started"
              onPress={() => router.push('/cycle/setup' as any)}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const mode: PredictionMode = prediction?.mode ?? 'irregular';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Cycle</Text>
        <TouchableOpacity
          onPress={() => router.push('/cycle/setup' as any)}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Edit cycle setup"
        >
          <Ionicons name="settings-outline" size={20} color={t.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Method badge */}
        {currentContraception && (
          <View style={styles.section}>
            <View style={styles.methodRow}>
              <Ionicons name="medical-outline" size={14} color={t.textSecondary} />
              <Text style={[styles.methodText, { color: t.textSecondary }]}>
                {CONTRACEPTION_LABELS[currentContraception.method]}
              </Text>
            </View>
          </View>
        )}

        {/* Predictions — only in cyclical / scheduled modes */}
        {prediction && (mode === 'cyclical' || mode === 'scheduled_cycle') && (
          <>
            {/* Wheel + phase */}
            <View style={styles.section}>
              <View style={styles.wheelWrap}>
                <CycleWheel
                  cycleLength={stats?.avgCycleLength ?? tracking.typicalCycleLength ?? 28}
                  currentDay={
                    mostRecent
                      ? daysBetween(mostRecent.startDate, todayKey()) + 1
                      : 1
                  }
                  periodLength={stats?.avgPeriodLength ?? tracking.typicalPeriodLength ?? 5}
                  ovulationDay={
                    prediction
                      ? daysBetween(
                          mostRecent?.startDate ?? todayKey(),
                          prediction.ovulationDate,
                        ) + 1
                      : 14
                  }
                />
                <View style={styles.wheelCenter}>
                  <Text style={[styles.wheelDayLabel, { color: t.textSecondary }]}>DAY</Text>
                  <Text style={[styles.wheelDayNumber, { color: t.text }]}>
                    {mostRecent ? daysBetween(mostRecent.startDate, todayKey()) + 1 : '—'}
                  </Text>
                  <Text style={[styles.wheelOfLabel, { color: t.textSecondary }]}>
                    of {stats?.avgCycleLength ?? tracking.typicalCycleLength ?? 28}
                  </Text>
                </View>
              </View>
            </View>

            {/* Next period */}
            <View style={styles.section}>
              <GlassCard>
                <View style={styles.cardHeader}>
                  <Ionicons name="calendar-outline" size={18} color={t.primary} />
                  <Text style={[styles.cardKicker, { color: t.textSecondary }]}>
                    {prediction.isLate ? 'PERIOD LATE BY' : 'NEXT PERIOD IN'}
                  </Text>
                </View>
                <Text style={[styles.bigNumber, { color: t.text }]}>
                  {Math.abs(prediction.daysUntilNextPeriod)}
                  <Text style={[styles.bigNumberSmall, { color: t.textSecondary }]}>
                    {' '}day{Math.abs(prediction.daysUntilNextPeriod) === 1 ? '' : 's'}
                  </Text>
                </Text>
                <Text style={[styles.cardSub, { color: t.textSecondary }]}>
                  Expected: {prediction.nextPeriodDate}
                </Text>
                {prediction.confidenceReason && (
                  <View style={styles.confidenceRow}>
                    <Ionicons
                      name={
                        prediction.confidence === 'high'
                          ? 'checkmark-circle-outline'
                          : 'information-circle-outline'
                      }
                      size={12}
                      color={t.textSecondary}
                    />
                    <Text style={[styles.confidenceText, { color: t.textSecondary }]}>
                      {prediction.confidenceReason}
                    </Text>
                  </View>
                )}
              </GlassCard>
            </View>

            {/* Fertile + PMS windows */}
            <View style={styles.section}>
              <View style={styles.dualRow}>
                <GlassCard style={{ ...styles.dualCard, marginRight: 6 }}>
                  <Ionicons name="leaf-outline" size={16} color="#15803D" />
                  <Text style={[styles.dualTitle, { color: t.text }]}>Fertile</Text>
                  <Text style={[styles.dualSub, { color: t.textSecondary }]}>
                    {shortDate(prediction.fertileWindow.start)} – {shortDate(prediction.fertileWindow.end)}
                  </Text>
                </GlassCard>
                <GlassCard style={{ ...styles.dualCard, marginLeft: 6 }}>
                  <Ionicons name="cloud-outline" size={16} color="#B45309" />
                  <Text style={[styles.dualTitle, { color: t.text }]}>PMS window</Text>
                  <Text style={[styles.dualSub, { color: t.textSecondary }]}>
                    {shortDate(prediction.pmsWindow.start)} – {shortDate(prediction.pmsWindow.end)}
                  </Text>
                </GlassCard>
              </View>
            </View>
          </>
        )}

        {/* Non-cyclical mode banner */}
        {(mode === 'continuous' || mode === 'irregular' || mode === 'returning') && (
          <View style={styles.section}>
            <GlassCard>
              <View style={styles.cardHeader}>
                <Ionicons name="information-circle-outline" size={18} color={t.primary} />
                <Text style={[styles.cardKicker, { color: t.textSecondary }]}>
                  {mode === 'continuous' && 'NO CYCLE TO PREDICT'}
                  {mode === 'returning' && 'RETURNING CYCLE'}
                  {mode === 'irregular' && 'IRREGULAR CYCLE'}
                </Text>
              </View>
              <Text style={[styles.modeBody, { color: t.text }]}>
                {mode === 'continuous' &&
                  'Your method suppresses the natural cycle, so predictions would be guesswork. Log symptoms and any bleeding so we can still surface useful patterns.'}
                {mode === 'returning' &&
                  'Cycles often take months to return after childbirth and can be irregular while breastfeeding. Log what you notice — predictions stay off until a pattern emerges.'}
                {mode === 'irregular' &&
                  'Predictions are off during perimenopause and menopause when cycle length varies significantly. Track symptoms, mood, and any bleeding.'}
              </Text>
            </GlassCard>
          </View>
        )}

        {/* Today log CTA */}
        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => router.push('/cycle/log' as any)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Log today's symptoms, flow, and mood"
          >
            <GlassCard>
              <View style={styles.logCTA}>
                <View style={styles.logCTALeft}>
                  <Text style={[styles.logCTATitle, { color: t.text }]}>
                    Log today
                  </Text>
                  <Text style={[styles.logCTASub, { color: t.textSecondary }]}>
                    {dayLog
                      ? `${dayLog.symptoms.length} symptom${dayLog.symptoms.length === 1 ? '' : 's'}, ${dayLog.moods.length} mood${dayLog.moods.length === 1 ? '' : 's'}`
                      : 'Flow, symptoms, mood, BBT'}
                  </Text>
                </View>
                <View style={[styles.logCTAIcon, { backgroundColor: t.primary }]}>
                  <Ionicons
                    name={dayLog ? 'create-outline' : 'add'}
                    size={18}
                    color="#fff"
                  />
                </View>
              </View>
            </GlassCard>
          </TouchableOpacity>
        </View>

        {/* Period status */}
        <View style={styles.section}>
          {activePeriod ? (
            <GlassCard>
              <View style={styles.cardHeader}>
                <View style={[styles.dot, { backgroundColor: PHASE_COLORS.menstrual }]} />
                <Text style={[styles.cardKicker, { color: t.textSecondary }]}>
                  ON YOUR PERIOD
                </Text>
              </View>
              <Text style={[styles.cardBody, { color: t.text }]}>
                Started {shortDate(activePeriod.startDate)} · day{' '}
                {daysBetween(activePeriod.startDate, todayKey()) + 1}
              </Text>
              <TouchableOpacity
                style={[styles.endPeriodBtn, { borderColor: t.primary }]}
                onPress={() =>
                  useCycleStore.getState().endPeriod(activePeriod.id)
                }
                accessibilityRole="button"
                accessibilityLabel="Mark period as ended today"
              >
                <Text style={[styles.endPeriodText, { color: t.primary }]}>
                  Period ended today
                </Text>
              </TouchableOpacity>
            </GlassCard>
          ) : (
            <GlassCard>
              <View style={styles.cardHeader}>
                <Ionicons name="water-outline" size={18} color={t.primary} />
                <Text style={[styles.cardKicker, { color: t.textSecondary }]}>
                  LOG A PERIOD
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.startPeriodBtn, { backgroundColor: t.primary }]}
                onPress={() =>
                  useCycleStore.getState().startPeriod({ source: 'manual' })
                }
                accessibilityRole="button"
                accessibilityLabel="Start a period today"
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.startPeriodText}>My period started today</Text>
              </TouchableOpacity>
            </GlassCard>
          )}
        </View>

        {/* History link */}
        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => router.push('/cycle/history' as any)}
            style={styles.historyLink}
            accessibilityRole="button"
            accessibilityLabel="View cycle history and insights"
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.historyTitle, { color: t.text }]}>History & insights</Text>
              <Text style={[styles.historySub, { color: t.textSecondary }]}>
                {stats
                  ? `${stats.cycleCount} cycle${stats.cycleCount === 1 ? '' : 's'} logged · avg ${stats.avgCycleLength} days`
                  : 'Log a few cycles to unlock trends'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CycleWheel({
  cycleLength,
  currentDay,
  periodLength,
  ovulationDay,
}: {
  cycleLength: number;
  currentDay: number;
  periodLength: number;
  ovulationDay: number;
}) {
  const t = useTheme();
  const segments = useMemo(() => {
    const out: { startAngle: number; endAngle: number; color: string }[] = [];
    for (let d = 1; d <= cycleLength; d++) {
      const a0 = ((d - 1) / cycleLength) * 360 - 90;
      const a1 = (d / cycleLength) * 360 - 90;
      let color: string = 'rgba(0,0,0,0.06)';
      if (d <= periodLength) color = PHASE_COLORS.menstrual;
      else if (d === ovulationDay) color = PHASE_COLORS.ovulatory;
      else if (d >= ovulationDay - 5 && d < ovulationDay) color = PHASE_COLORS.follicular;
      else if (d > ovulationDay) color = PHASE_COLORS.luteal;
      out.push({ startAngle: a0, endAngle: a1, color });
    }
    return out;
  }, [cycleLength, periodLength, ovulationDay]);

  // "Current day" indicator dot
  const currentAngle = ((Math.max(1, Math.min(currentDay, cycleLength)) - 0.5) / cycleLength) * 360 - 90;
  const currentRad = (currentAngle * Math.PI) / 180;
  const cx = WHEEL_SIZE / 2 + WHEEL_RADIUS * Math.cos(currentRad);
  const cy = WHEEL_SIZE / 2 + WHEEL_RADIUS * Math.sin(currentRad);

  return (
    <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
      <G>
        {segments.map((s, i) => {
          const pad = 0.5; // tiny gap between segments
          const a0 = ((s.startAngle + pad) * Math.PI) / 180;
          const a1 = ((s.endAngle - pad) * Math.PI) / 180;
          const x0 = WHEEL_SIZE / 2 + WHEEL_RADIUS * Math.cos(a0);
          const y0 = WHEEL_SIZE / 2 + WHEEL_RADIUS * Math.sin(a0);
          const x1 = WHEEL_SIZE / 2 + WHEEL_RADIUS * Math.cos(a1);
          const y1 = WHEEL_SIZE / 2 + WHEEL_RADIUS * Math.sin(a1);
          return (
            <Line
              key={i}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={s.color}
              strokeWidth={WHEEL_STROKE}
              strokeLinecap="butt"
            />
          );
        })}
      </G>
      {/* Current day dot */}
      <Circle cx={cx} cy={cy} r={10} fill={t.text} />
      <Circle cx={cx} cy={cy} r={5} fill="#fff" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 10,
    textAlign: 'center',
    fontFamily: 'Playfair-Black',
  },
  emptyBody: {
    fontSize: FontSizes.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  methodText: {
    fontSize: 12,
    fontWeight: '600',
  },
  wheelWrap: {
    alignSelf: 'center',
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelDayLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  wheelDayNumber: {
    fontSize: 68,
    fontWeight: '900',
    lineHeight: 72,
    fontFamily: 'Playfair-Black',
  },
  wheelOfLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cardKicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  bigNumber: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -0.5,
    fontFamily: 'Playfair-Black',
  },
  bigNumberSmall: {
    fontSize: 20,
    fontFamily: 'DMSans-SemiBold',
  },
  cardSub: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  cardBody: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  confidenceRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'flex-start',
    marginTop: 8,
  },
  confidenceText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontStyle: 'italic',
  },
  dualRow: {
    flexDirection: 'row',
  },
  dualCard: {
    flex: 1,
    gap: 4,
  },
  dualTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    marginTop: 4,
  },
  dualSub: {
    fontSize: 12,
  },
  modeBody: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  logCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logCTALeft: {
    flex: 1,
  },
  logCTATitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    marginBottom: 2,
  },
  logCTASub: {
    fontSize: 12,
  },
  logCTAIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  endPeriodBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  endPeriodText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  startPeriodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
  },
  startPeriodText: {
    color: '#fff',
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  historyTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    marginBottom: 2,
  },
  historySub: {
    fontSize: 12,
  },
});
