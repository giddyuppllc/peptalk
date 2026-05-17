/**
 * Activity detail (v3 Phase A placeholder).
 *
 * §7 spec — drill-in for Activity. Phase E ships the full workout log,
 * custom program follow-along, performance metrics, and HealthKit pull.
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';

export default function ActivityScreen() {
  const t = useV3Theme();
  return (
    <V3DetailShell
      title="Activity"
      observation="Two workouts this week. One more keeps the streak alive."
      intent="activity_overview"
    >
      <GlassCard>
        <Text
          style={[
            styles.placeholder,
            {
              color: t.colors.textPrimary as string,
              fontFamily: t.isDark
                ? t.typography.headlineMale
                : t.typography.headlineFemale,
            },
          ]}
        >
          Activity detail — coming online
        </Text>
        <Text
          style={[
            styles.sub,
            {
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
            },
          ]}
        >
          Phase E ships the workout log, custom programs, performance
          metrics, and HealthKit / Google Fit step pull.
        </Text>
      </GlassCard>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    fontSize: 18,
    marginBottom: 8,
  },
  sub: {
    fontSize: 13,
    lineHeight: 19,
  },
});
