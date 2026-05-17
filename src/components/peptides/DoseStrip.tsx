/**
 * DoseStrip — 7-day horizontal dot strip with today on the right.
 *
 * Each column shows one day; the bubble's size + opacity scale with
 * the number of doses logged that day. Tap a day to expand and see
 * the individual dose rows (peptide name, dose, time) — re-tap to
 * collapse.
 *
 * Reads NOTHING from any store directly — caller passes in the
 * window's dose entries so we can swap this onto Home (Phase 2)
 * with a different filter applied. The shape mirrors
 * `useDoseLogStore`'s DoseLogEntry minimum subset.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface DoseStripEntry {
  /** Stable id (used as a React key). */
  id: string;
  /** Display name to show in the expanded list, e.g. "BPC-157". */
  peptideName: string;
  /** Numeric amount, e.g. 250. */
  amount: number;
  /** Unit string, e.g. "mcg". */
  unit: string;
  /** When the dose was taken — anything `new Date()` accepts works. */
  loggedAt: Date | string;
}

export interface DoseStripProps {
  /** Up to last 7 days of doses. We bucket them by local-date. */
  entries: DoseStripEntry[];
  /** Accent color for the dose dots. */
  accentColor?: string;
  /** Track color for empty-day bubbles. */
  trackColor?: string;
  /** Label color (M T W T F S S, "today"). */
  labelColor?: string;
  /** Color of expanded-row text. */
  textColor?: string;
  /** Card background for the expanded panel. */
  expandedBg?: string;
  /** How many days to render (default 7, today rightmost). */
  windowDays?: number;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function DoseStrip({
  entries,
  accentColor = '#9B86A4',
  trackColor = 'rgba(0,0,0,0.08)',
  labelColor = '#6B7280',
  textColor = '#2D2D2D',
  expandedBg = '#FFFFFF',
  windowDays = 7,
}: DoseStripProps) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Build a windowed day-list: leftmost = (windowDays - 1) days ago,
  // rightmost = today. Each day carries its bucketed dose entries.
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Pre-bucket entries by local date.
    const buckets = new Map<string, (DoseStripEntry & { dt: Date })[]>();
    for (const e of entries) {
      const dt = e.loggedAt instanceof Date ? e.loggedAt : new Date(e.loggedAt);
      if (isNaN(dt.getTime())) continue;
      const key = dayKey(dt);
      const arr = buckets.get(key) ?? [];
      arr.push({ ...e, dt });
      buckets.set(key, arr);
    }

    const out: {
      key: string;
      date: Date;
      letter: string;
      isToday: boolean;
      doses: (DoseStripEntry & { dt: Date })[];
    }[] = [];

    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = dayKey(d);
      const list = (buckets.get(key) ?? []).sort(
        (a, b) => a.dt.getTime() - b.dt.getTime(),
      );
      out.push({
        key,
        date: d,
        letter: DAY_LETTERS[d.getDay()],
        isToday: i === 0,
        doses: list,
      });
    }
    return out;
  }, [entries, windowDays]);

  // Highest single-day count drives the dot-scale ceiling so the
  // strip auto-balances even if the user has 6 doses on one day.
  const maxCount = useMemo(
    () => Math.max(1, ...days.map((d) => d.doses.length)),
    [days],
  );

  return (
    <View>
      <View style={styles.row}>
        {days.map((d) => {
          const count = d.doses.length;
          const ratio = count / maxCount; // 0..1
          // Bubble grows 14 → 26 px as the day's count approaches the max.
          const base = 14;
          const grow = 12;
          const size = count === 0 ? base : Math.round(base + grow * ratio);
          const bubbleColor =
            count === 0 ? trackColor : accentColor;
          const opacity = count === 0 ? 1 : 0.4 + 0.6 * ratio;
          const isExpanded = expandedDay === d.key;

          return (
            <TouchableOpacity
              key={d.key}
              style={styles.col}
              activeOpacity={0.7}
              onPress={() =>
                setExpandedDay((cur) => (cur === d.key ? null : d.key))
              }
              accessibilityRole="button"
              accessibilityLabel={
                count === 0
                  ? `${d.isToday ? 'Today' : d.date.toDateString()}, no doses`
                  : `${d.isToday ? 'Today' : d.date.toDateString()}, ${count} dose${count === 1 ? '' : 's'}, tap to view`
              }
              accessibilityState={{ expanded: isExpanded }}
            >
              <Text
                style={[
                  styles.letter,
                  {
                    color: d.isToday ? accentColor : labelColor,
                    fontFamily: d.isToday ? 'DMSans-Bold' : 'DMSans-Medium',
                  },
                ]}
              >
                {d.isToday ? 'TODAY' : d.letter}
              </Text>
              <View
                style={[
                  styles.bubble,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: bubbleColor,
                    opacity,
                    borderColor: isExpanded ? accentColor : 'transparent',
                    borderWidth: isExpanded ? 2 : 0,
                  },
                ]}
              >
                {count > 0 && (
                  <Text
                    style={[
                      styles.countText,
                      { color: '#FFFFFF', fontSize: Math.max(9, size * 0.36) },
                    ]}
                  >
                    {count}
                  </Text>
                )}
              </View>
              <Text style={[styles.dayNum, { color: labelColor }]}>
                {d.date.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Expanded panel for the tapped day */}
      {expandedDay && (() => {
        const day = days.find((dd) => dd.key === expandedDay);
        if (!day) return null;
        return (
          <View style={[styles.expanded, { backgroundColor: expandedBg, borderColor: trackColor }]}>
            <View style={styles.expandedHeader}>
              <Text style={[styles.expandedTitle, { color: textColor }]}>
                {day.isToday
                  ? 'Today'
                  : day.date.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}
              </Text>
              <Text style={[styles.expandedCount, { color: labelColor }]}>
                {day.doses.length} dose{day.doses.length === 1 ? '' : 's'}
              </Text>
            </View>
            {day.doses.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="moon-outline" size={14} color={labelColor} />
                <Text style={[styles.emptyText, { color: labelColor }]}>
                  No doses logged
                </Text>
              </View>
            ) : (
              day.doses.map((dose) => (
                <View key={dose.id} style={styles.doseRow}>
                  <View style={[styles.doseDot, { backgroundColor: accentColor }]} />
                  <Text style={[styles.doseName, { color: textColor }]} numberOfLines={1}>
                    {dose.peptideName}
                  </Text>
                  <Text style={[styles.doseAmount, { color: labelColor }]} numberOfLines={1}>
                    {dose.amount} {dose.unit}
                  </Text>
                  <Text style={[styles.doseTime, { color: labelColor }]}>
                    {formatTime(dose.dt)}
                  </Text>
                </View>
              ))
            )}
          </View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    gap: 6,
  },
  letter: {
    fontSize: 10,
    letterSpacing: 0.6,
  },
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: 'DMSans-Bold',
  },
  dayNum: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    marginTop: 2,
  },

  // Expanded panel
  expanded: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  expandedTitle: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.3,
  },
  expandedCount: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
  },
  doseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  doseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  doseName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },
  doseAmount: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
  },
  doseTime: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginLeft: 6,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    fontStyle: 'italic',
  },
});

export default DoseStrip;
