/**
 * v3 Home — 4-card dashboard with Aimee centerpiece.
 *
 * Locked per Master Refactor Plan v3.1 §4.
 *
 * Structure:
 *   greeting bar (avatar top-right)
 *   ─────────────────
 *   AimeeCenterpiece (orb + observation + chips)
 *   ─────────────────
 *   DrillCard: Weekly Tracker → /tracker
 *   DrillCard: Nutrition      → /nutrition
 *   DrillCard: Activity       → /activity
 *   DrillCard: Doses          → /doses
 *   ReportRibbon
 *   AimeeFAB (absolute bottom-right)
 *
 * Card preview content per §4.2 — populated with placeholder data in
 * Phase A. Subsequent phases (B/D/E) wire real store reads.
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  V3Background,
  Greeting,
  AimeeCenterpiece,
  DrillCard,
  WeekStrip,
  Chip,
  ChipRow,
  MacroRing,
  MacroBar,
  ActivityRings,
  StatRow,
  SyringeSVG,
  ReportRibbon,
  AimeeFAB,
} from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { useActivePeptideCycle } from '../../src/hooks/useActivePeptideCycle';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useCheckinStore } from '../../src/store/useCheckinStore';
import { useMealStore } from '../../src/store/useMealStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { getPeptideById } from '../../src/data/peptides';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const t = useV3Theme();
  const activeCycle = useActivePeptideCycle();
  // 2026-05-17 P0 fix: each of these selectors must return a STABLE
  // reference. `useMealStore((s) => s.getDailyTotals(todayKey()))` was
  // calling the computed accessor inside the selector, producing a
  // brand-new totals object on every render — Zustand v5's Object.is
  // comparison flagged that as "changed" and looped infinitely
  // ("Maximum update depth exceeded" crash on HomeScreen). Same bug
  // shape as the DosesHubScreen fix in Wave 76.18.
  // Pull raw arrays / accessor function refs instead, compute in
  // useMemo.
  const protocols = useDoseLogStore((s) => s.protocols);
  const checkins = useCheckinStore((s) => s.entries);
  const meals = useMealStore((s) => s.meals);
  const getDailyTotals = useMealStore((s) => s.getDailyTotals);
  const macroTargets = useMealStore((s) => s.targets);
  const workouts = useWorkoutStore((s) => s.logs);

  const todayDateKey = useMemo(() => todayKey(), []);
  const mealTotals = useMemo(
    () => getDailyTotals(todayDateKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getDailyTotals, todayDateKey, meals],
  );

  // Most recent check-in for the Weekly Tracker chips (mood / sleep / energy).
  const latestCheckin = useMemo(() => {
    if (!checkins?.length) return null;
    return [...checkins].sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    )[0];
  }, [checkins]);

  // Workouts logged in the last 7 days.
  const recentWorkoutCount = useMemo(() => {
    if (!workouts?.length) return 0;
    const weekAgo = Date.now() - 7 * 86400_000;
    return workouts.filter(
      (w) => new Date(w.date ?? w.startedAt ?? 0).getTime() > weekAgo,
    ).length;
  }, [workouts]);

  const moodLabel = latestCheckin?.mood
    ? `Mood · ${
        ['low', 'below', 'solid', 'good', 'great'][latestCheckin.mood - 1] ??
        'logged'
      }`
    : 'Mood · log today';
  const sleepHours = latestCheckin?.sleepStages?.total;
  const sleepLabel =
    sleepHours != null && sleepHours > 0
      ? `Sleep · ${Math.floor(sleepHours)}h ${Math.round((sleepHours % 1) * 60)}m`
      : 'Sleep · log today';
  const energyLabel = latestCheckin?.energy
    ? `Energy · ${latestCheckin.energy}/5`
    : 'Energy · log today';

  // Resolve the most recent active protocol's headline + draw figures for
  // the Doses card preview. Falls back to friendly "no protocol yet" copy
  // when the user hasn't started anything — was hardcoded "Retatrutide ·
  // Wk 6 / 12" before, which made every new user wonder whose protocol
  // they were looking at.
  const dosePreview = useMemo(() => {
    if (!activeCycle) {
      return {
        title: 'No active protocol',
        detail: 'Tap to start one in the calculator',
        fillMl: 0,
      };
    }
    const protocol = protocols
      .filter((p) => p.isActive && p.peptideId === activeCycle.peptideId)
      .sort(
        (a, b) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      )[0];
    const peptide = getPeptideById(activeCycle.peptideId);
    const totalWeeksLabel = activeCycle.totalWeeks
      ? `Wk ${activeCycle.weekNumber} / ${activeCycle.totalWeeks}`
      : `Wk ${activeCycle.weekNumber}`;
    const title = `${peptide?.name ?? activeCycle.peptideName} · ${totalWeeksLabel}`;
    const detail = protocol
      ? `${protocol.dose} ${protocol.unit} · ${protocol.frequency.replace(/_/g, ' ')}`
      : 'Open Doses for the draw math';
    // Show a small fill so the syringe still reads as a syringe. The
    // exact mL math lives in the Doses hub where vial concentration is
    // known.
    return { title, detail, fillMl: 0.2 };
  }, [activeCycle, protocols]);

  return (
    <View style={styles.root}>
      <V3Background />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Greeting variant="home" proBadge={t.isDark} />

        <AimeeCenterpiece />

        <View style={styles.cards}>
          <Animated.View entering={FadeInDown.delay(60).duration(320)}>
            <DrillCard
              label="Weekly Tracker"
              onPress={() => router.push('/tracker' as never)}
              preview={
                <View>
                  <WeekStrip />
                  <View style={{ height: 12 }} />
                  <ChipRow>
                    <Chip label={moodLabel} dotColor="#9B86A4" />
                    <Chip label={sleepLabel} dotColor="#7ABED0" />
                    <Chip label={energyLabel} dotColor="#E89672" />
                  </ChipRow>
                </View>
              }
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(320)}>
            <DrillCard
              label="Nutrition"
              onPress={() => router.push('/nutrition' as never)}
              preview={
                <View style={styles.nutritionRow}>
                  <MacroRing
                    current={Math.round(mealTotals.proteinGrams ?? 0)}
                    target={macroTargets.proteinGrams ?? 100}
                    unit="g"
                    label="PROTEIN"
                  />
                  <View style={styles.nutritionBars}>
                    <MacroBar
                      kind="carbs"
                      current={Math.round(mealTotals.carbsGrams ?? 0)}
                      target={macroTargets.carbsGrams ?? 220}
                    />
                    <MacroBar
                      kind="fat"
                      current={Math.round(mealTotals.fatGrams ?? 0)}
                      target={macroTargets.fatGrams ?? 70}
                    />
                    <MacroBar
                      kind="fiber"
                      current={Math.round(mealTotals.fiberGrams ?? 0)}
                      target={macroTargets.fiberGrams ?? 28}
                    />
                  </View>
                </View>
              }
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(180).duration(320)}>
            <DrillCard
              label="Activity"
              onPress={() => router.push('/activity' as never)}
              preview={
                <View style={styles.activityRow}>
                  <ActivityRings
                    move={Math.min(100, Math.round(((latestCheckin?.activeCalories ?? 0) / 500) * 100))}
                    exercise={Math.min(100, Math.round(((recentWorkoutCount ?? 0) / 5) * 100))}
                    stand={Math.min(100, Math.round(((latestCheckin?.steps ?? 0) / 10000) * 100))}
                  />
                  <View style={styles.activityStats}>
                    <StatRow
                      label="Steps"
                      value={
                        latestCheckin?.steps != null
                          ? latestCheckin.steps.toLocaleString()
                          : '—'
                      }
                    />
                    <StatRow
                      label="Active"
                      value={
                        latestCheckin?.activeCalories != null
                          ? `${Math.round(latestCheckin.activeCalories)} cal`
                          : '—'
                      }
                    />
                    <StatRow
                      label="Workouts"
                      value={String(recentWorkoutCount)}
                      hideSeparator
                    />
                  </View>
                </View>
              }
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).duration(320)}>
            <DrillCard
              label="Doses"
              onPress={() => router.push('/doses' as never)}
              preview={
                <View>
                  <SyringeSVG fillMl={dosePreview.fillMl} showMarker width={260} />
                  <View style={styles.dosesRow}>
                    <Text
                      style={[
                        styles.dosesProtocol,
                        {
                          color: t.colors.textPrimary as string,
                          fontFamily: t.isDark
                            ? t.typography.headlineMale
                            : t.typography.headlineFemale,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {dosePreview.title}
                    </Text>
                    <Text
                      style={[
                        styles.dosesDetail,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {dosePreview.detail}
                    </Text>
                  </View>
                </View>
              }
            />
          </Animated.View>
        </View>

        <ReportRibbon />
      </ScrollView>

      <AimeeFAB />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingBottom: 30,
  },
  cards: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  nutritionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  nutritionBars: {
    flex: 1,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  activityStats: {
    flex: 1,
  },
  dosesRow: {
    marginTop: 8,
  },
  dosesProtocol: {
    fontSize: 16,
  },
  dosesDetail: {
    fontSize: 12,
    marginTop: 2,
  },
});
