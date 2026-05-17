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

import React from 'react';
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

export default function HomeScreen() {
  const router = useRouter();
  const t = useV3Theme();

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
                    <Chip label="Mood · solid" dotColor="#9B86A4" />
                    <Chip label="Sleep · 7h 30m" dotColor="#7ABED0" />
                    <Chip label="Energy · 8/10" dotColor="#E89672" />
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
                  <MacroRing current={75} target={100} unit="g" label="PROTEIN" />
                  <View style={styles.nutritionBars}>
                    <MacroBar kind="carbs" current={120} target={220} />
                    <MacroBar kind="fat" current={42} target={70} />
                    <MacroBar kind="fiber" current={14} target={28} />
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
                  <ActivityRings move={72} exercise={56} stand={40} />
                  <View style={styles.activityStats}>
                    <StatRow label="Steps" value="6,420" />
                    <StatRow label="Active" value="380 cal" />
                    <StatRow label="Workouts" value="3" hideSeparator />
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
                  <SyringeSVG fillMl={0.2} showMarker width={260} />
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
                    >
                      Retatrutide · Wk 6 / 12
                    </Text>
                    <Text
                      style={[
                        styles.dosesDetail,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                    >
                      2 mg per shot · 0.20 mL draw
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
