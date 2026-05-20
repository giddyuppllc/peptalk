/**
 * CycleProgressBar — horizontal day-by-day cycle progress strip.
 *
 * Renders a row of dots, one per day in the cycle. Days the user has
 * logged a dose are FILLED with the accent color; future-scheduled days
 * are HOLLOW (track-color outline); the current day gets a larger
 * highlighted accent dot so the user can find themselves on the strip
 * at a glance.
 *
 * Pure presentation — caller passes in `totalDays`, `currentDay`, and
 * the list of dates that have logged doses. We map each day-index back
 * to a date by subtracting from "today" (so day 1 = `currentDay` days
 * ago, day `currentDay` = today, future days = upcoming).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface CycleProgressBarProps {
  /** Total cycle length, in days. e.g. 28. Always >= 1. */
  totalDays: number;
  /** Current day of the cycle (1-indexed). Clamped to [1, totalDays]. */
  currentDay: number;
  /** All dose-log timestamps relevant to this cycle. */
  dosesLogged: Date[];
  /** Accent color for filled / current dots. */
  accentColor?: string;
  /** Track color for hollow / scheduled dots. */
  trackColor?: string;
  /** Color for day-1 / day-N captions. */
  captionColor?: string;
  /** Override the cycle start date (otherwise inferred as `currentDay - 1` days ago). */
  startDate?: Date;
  /** Hide the day-1 / day-N captions under the strip. */
  hideCaptions?: boolean;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function CycleProgressBar({
  totalDays,
  currentDay,
  dosesLogged,
  accentColor = '#9B86A4',
  trackColor = 'rgba(0,0,0,0.12)',
  captionColor = '#6B7280',
  startDate,
  hideCaptions = false,
}: CycleProgressBarProps) {
  const safeTotal = Math.max(1, Math.floor(totalDays));
  const safeCurrent = Math.min(safeTotal, Math.max(1, Math.floor(currentDay)));

  // Resolve a startDate so dot-index → calendar date is unambiguous.
  // If caller didn't pass one, infer that "today" is day `currentDay`.
  const computedStart = useMemo(() => {
    if (startDate) return new Date(startDate);
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (safeCurrent - 1));
    return d;
  }, [startDate, safeCurrent]);

  // Pre-build a set of yyyy-mm-dd strings for fast dose-lookup per day.
  const loggedDayKeys = useMemo(() => {
    const set = new Set<string>();
    for (const d of dosesLogged) {
      if (!d) continue;
      const dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) continue;
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      set.add(`${y}-${m}-${day}`);
    }
    return set;
  }, [dosesLogged]);

  // Pick a per-dot pixel size that lets totalDays fit without horizontal
  // scroll. 28-day cycle gets ~7px dots with 3px gaps; longer cycles
  // shrink further. flexGrow on each dot wrapper guarantees the strip
  // fills the row regardless of count.
  const dotDiameter = safeTotal <= 14 ? 12 : safeTotal <= 28 ? 9 : safeTotal <= 42 ? 7 : 5;

  const days = useMemo(() => {
    const out: {
      day: number;
      isLogged: boolean;
      isCurrent: boolean;
      isPast: boolean;
    }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < safeTotal; i++) {
      const d = new Date(computedStart);
      d.setDate(computedStart.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      out.push({
        day: i + 1,
        isLogged: loggedDayKeys.has(key),
        isCurrent: sameDay(d, today),
        isPast: d.getTime() < today.getTime(),
      });
    }
    return out;
  }, [computedStart, safeTotal, loggedDayKeys]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Cycle day ${safeCurrent} of ${safeTotal}. ${
        days.filter((d) => d.isLogged).length
      } doses logged so far.`}
      accessibilityValue={{ min: 0, max: safeTotal, now: safeCurrent }}
    >
      <View style={styles.row}>
        {days.map((d) => {
          const filled = d.isLogged;
          const isCurrent = d.isCurrent;
          const size = isCurrent ? dotDiameter + 4 : dotDiameter;
          let bg: string;
          let borderColor: string;
          let borderWidth = 0;

          if (isCurrent) {
            bg = accentColor;
            borderColor = accentColor;
          } else if (filled) {
            bg = accentColor;
            borderColor = accentColor;
          } else {
            bg = 'transparent';
            borderColor = trackColor;
            borderWidth = 1.5;
          }

          return (
            <View key={d.day} style={[styles.dotWrap, { height: dotDiameter + 6 }]}>
              <View
                style={[
                  styles.dot,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: bg,
                    borderColor,
                    borderWidth,
                    // Lift current-day dot slightly so it pops against the row.
                    transform: isCurrent ? [{ scale: 1 }] : undefined,
                    shadowColor: isCurrent ? accentColor : 'transparent',
                    shadowOpacity: isCurrent ? 0.45 : 0,
                    shadowRadius: isCurrent ? 4 : 0,
                    shadowOffset: { width: 0, height: 0 },
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {!hideCaptions && (
        <View style={styles.captionRow}>
          <Text style={[styles.caption, { color: captionColor }]}>day 1</Text>
          <Text style={[styles.captionCurrent, { color: accentColor }]}>
            day {safeCurrent}
          </Text>
          <Text style={[styles.caption, { color: captionColor }]}>
            day {safeTotal}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
    paddingHorizontal: 2,
    minHeight: 18,
  },
  dotWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    // base styling — sized inline
  },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  caption: {
    fontSize: 10,
    fontFamily: 'DMSans-Medium',
    letterSpacing: 0.4,
    textTransform: 'lowercase',
  },
  captionCurrent: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.4,
    textTransform: 'lowercase',
  },
});

export default CycleProgressBar;
