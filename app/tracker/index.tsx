/**
 * Tracker detail (v3 Phase A placeholder).
 *
 * §5 spec — drill-in for Weekly Tracker. Phase A: shell + placeholder.
 * Phase F2/G populate the calendar + sub-cards (doses · InBody · weight ·
 * sleep · blood work · progress photos · mood notes).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';

export default function TrackerScreen() {
  const t = useV3Theme();
  return (
    <V3DetailShell
      title="Weekly Tracker"
      observation="Your week's looking solid. 5 of 7 days logged."
      intent="tracker_overview"
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
          Tracker detail — coming online
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
          Phase F2 will populate this with the calendar, InBody, weight,
          sleep, blood work, progress photos, and mood notes — all rolled
          up from your weekly logs.
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
