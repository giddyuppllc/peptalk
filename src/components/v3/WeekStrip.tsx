/**
 * WeekStrip — 7-day pill row with today highlighted.
 *
 * Female: pastel pills with rose-accent today pill.
 * Male: dark glass pills with oxblood today pill.
 *
 * Phase A: visual-only with mocked data. Phase B/D/E wire the dot
 * status indicators (workout/meal/dose/check-in).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV3Theme } from '../../theme/V3ThemeProvider';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface Props {
  /** Optional day index of today (0 = Sun). Defaults to actual today. */
  todayIndex?: number;
  /** Optional dot status per day (mock-able for Phase A). */
  statusPerDay?: Array<{
    workout?: boolean;
    meal?: boolean;
    dose?: boolean;
    checkin?: boolean;
  }>;
}

export function WeekStrip({ todayIndex = new Date().getDay(), statusPerDay }: Props) {
  const t = useV3Theme();

  return (
    <View style={styles.row}>
      {DAY_INITIALS.map((d, i) => {
        const isToday = i === todayIndex;
        const status = statusPerDay?.[i];
        return (
          <View
            key={i}
            style={[
              styles.cell,
              {
                backgroundColor: isToday
                  ? t.isDark
                    ? (t.colors as any).accentOxblood
                    : (t.colors as any).accentBabyBlue
                  : t.isDark
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(255,255,255,0.4)',
                borderRadius: t.radius.pill,
              },
            ]}
          >
            <Text
              style={{
                color: isToday
                  ? '#fff'
                  : (t.colors.textSecondary as string),
                fontFamily: t.typography.label,
                fontSize: 11,
                letterSpacing: 0.6,
              }}
            >
              {d}
            </Text>
            {status ? (
              <View style={styles.dotRow}>
                {status.workout && <View style={[styles.dot, { backgroundColor: '#E89672' }]} />}
                {status.meal && <View style={[styles.dot, { backgroundColor: '#6FA891' }]} />}
                {status.dose && <View style={[styles.dot, { backgroundColor: '#7ABED0' }]} />}
                {status.checkin && <View style={[styles.dot, { backgroundColor: '#9B86A4' }]} />}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  cell: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
