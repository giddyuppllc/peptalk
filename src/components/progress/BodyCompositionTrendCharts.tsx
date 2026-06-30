/**
 * BodyCompositionTrendCharts — three trend lines stacked.
 *
 * Pulls scan history from useBodyCompositionStore (90 days by default)
 * and renders weight + body fat % + lean mass charts. Each chart
 * shows its own empty state when there's not enough data, so this
 * component is safe to render unconditionally on Home.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useBodyCompositionStore } from '../../store/useBodyCompositionStore';
import { TrendChart } from './TrendChart';
import { Spacing } from '../../constants/theme';

const WINDOW_DAYS = 90;

export const BodyCompositionTrendCharts: React.FC = () => {
  const router = useRouter();
  // `recentScans(WINDOW_DAYS)` returns a freshly filtered+reversed array on
  // every call. Calling it inside the selector loops infinitely (Zustand
  // snapshot is never reference-stable → "Maximum update depth exceeded").
  // Select the raw scans + the method ref and derive in useMemo instead.
  const allScans = useBodyCompositionStore((s) => s.scans);
  const recentScans = useBodyCompositionStore((s) => s.recentScans);
  const scans = useMemo(
    () => recentScans(WINDOW_DAYS),
    [recentScans, allScans],
  );

  // Extract one series per metric. Scans are already oldest-first.
  const weightSeries = useMemo(
    () =>
      scans
        .filter((s) => typeof s.weightLb === 'number')
        .map((s) => ({ t: new Date(s.scannedAt).getTime(), v: s.weightLb as number })),
    [scans],
  );

  const bodyFatSeries = useMemo(
    () =>
      scans
        .filter((s) => typeof s.bodyFatPercent === 'number')
        .map((s) => ({
          t: new Date(s.scannedAt).getTime(),
          v: s.bodyFatPercent as number,
        })),
    [scans],
  );

  const leanMassSeries = useMemo(
    () =>
      scans
        .filter((s) => typeof s.leanMassLb === 'number')
        .map((s) => ({ t: new Date(s.scannedAt).getTime(), v: s.leanMassLb as number })),
    [scans],
  );

  const goToEntry = () => router.push('/settings/inbody-entry' as never);

  return (
    <View style={styles.wrap}>
      <TrendChart
        title="Weight"
        unit="lb"
        subtitle="Last 90 days"
        data={weightSeries}
        goodWhenDecreasing
        onPress={goToEntry}
      />
      <TrendChart
        title="Body fat"
        unit="%"
        subtitle="Last 90 days"
        data={bodyFatSeries}
        goodWhenDecreasing
        onPress={goToEntry}
      />
      <TrendChart
        title="Lean mass"
        unit="lb"
        subtitle="Last 90 days"
        data={leanMassSeries}
        goodWhenDecreasing={false}
        onPress={goToEntry}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
});
