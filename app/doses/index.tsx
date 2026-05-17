/**
 * Doses detail (v3 Phase A placeholder).
 *
 * §8 spec — drill-in for Doses. Phase B ships the full Calculator v2.1
 * (vial-size input, mg/mcg toggle, diluentType per peptide, acetic-acid
 * red-flag modal, retatrutide 10mg→1mL override) + Stack Builder with
 * interaction matrix + Side Effects log + Add-to-calendar.
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';

export default function DosesScreen() {
  const t = useV3Theme();
  return (
    <V3DetailShell
      title="Doses"
      observation="Day 12 of 84 on retatrutide. Pace looks healthy."
      intent="doses_overview"
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
          Doses detail — coming online
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
          Phase B ships the rebuilt Calculator (vial-size, mg/mcg toggle,
          diluent warnings, retatrutide overrides), Stack Builder with
          interaction matrix, Side Effects log, and the "Add to calendar"
          path that lands doses on your Weekly Tracker.
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
