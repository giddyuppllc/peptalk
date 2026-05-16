/**
 * SetDots — vertical list of set rows for the bespoke workout player.
 *
 * Each row shows a status bullet (● done / → current / ○ upcoming) plus the
 * target reps + the actual weight logged. The current row is highlighted with
 * the accent color and is non-tappable for now (logging happens through the
 * big primary button below). Done sets are tappable — onEditSet fires so the
 * parent can pop an inline editor.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontSizes } from '../../constants/theme';
import { AnimatedPress } from '../AnimatedPress';

export interface SetDotItem {
  /** Target reps for this set, or null when time-based */
  targetReps: number | null;
  /** Target hold time in seconds (for planks etc) */
  targetSeconds?: number;
  /** Actual reps logged */
  loggedReps?: number;
  /** Actual weight in lbs logged */
  loggedWeight?: number;
  /** done | current | upcoming */
  status: 'done' | 'current' | 'upcoming';
}

interface SetDotsProps {
  sets: SetDotItem[];
  /** Section accent (deep) — paints the "current" highlight + checkmarks */
  accentColor: string;
  textColor: string;
  textMutedColor: string;
  surfaceColor: string;
  borderColor: string;
  /** Tap a done row to edit it. Receives the set index. */
  onEditSet?: (setIndex: number) => void;
}

export function SetDots({
  sets,
  accentColor,
  textColor,
  textMutedColor,
  surfaceColor,
  borderColor,
  onEditSet,
}: SetDotsProps) {
  return (
    <View style={styles.column}>
      {sets.map((set, i) => {
        const isDone = set.status === 'done';
        const isCurrent = set.status === 'current';
        const label = `Set ${i + 1}`;
        const targetText = set.targetSeconds != null
          ? `${set.targetSeconds}s`
          : set.targetReps != null
            ? `${set.targetReps} reps`
            : '—';
        const detail = isDone
          ? `${set.loggedReps ?? set.targetReps ?? '—'} reps${
              set.loggedWeight ? ` · ${set.loggedWeight} lb` : ''
            }`
          : isCurrent
            ? targetText + (set.loggedWeight ? ` · ${set.loggedWeight} lb` : '')
            : targetText;

        const row = (
          <View
            style={[
              styles.row,
              {
                backgroundColor: isCurrent ? accentColor + '12' : surfaceColor,
                borderColor: isCurrent ? accentColor + '55' : borderColor,
              },
            ]}
          >
            <View
              style={[
                styles.dot,
                isDone && { backgroundColor: accentColor, borderColor: accentColor },
                isCurrent && { borderColor: accentColor },
                set.status === 'upcoming' && { borderColor: textMutedColor },
              ]}
            >
              {isDone && <Ionicons name="checkmark" size={12} color="#fff" />}
              {isCurrent && (
                <View
                  style={[styles.currentPulse, { backgroundColor: accentColor }]}
                />
              )}
            </View>
            <Text
              style={[
                styles.label,
                { color: isCurrent ? accentColor : textColor },
                isCurrent && { fontFamily: 'DMSans-Bold' },
              ]}
            >
              {label}
            </Text>
            <Text
              style={[
                styles.detail,
                { color: isDone ? textColor : isCurrent ? accentColor : textMutedColor },
              ]}
            >
              {detail}
            </Text>
            {isCurrent && (
              <Ionicons name="arrow-forward" size={14} color={accentColor} />
            )}
            {isDone && onEditSet && (
              <Ionicons name="pencil" size={12} color={textMutedColor} />
            )}
          </View>
        );

        if (isDone && onEditSet) {
          return (
            <AnimatedPress
              key={i}
              onPress={() => onEditSet(i)}
              accessibilityRole="button"
              accessibilityLabel={`Edit set ${i + 1}, logged ${set.loggedReps ?? '—'} reps at ${set.loggedWeight ?? 0} pounds`}
            >
              {row}
            </AnimatedPress>
          );
        }
        return (
          <View
            key={i}
            accessibilityRole={isCurrent ? 'text' : 'text'}
            accessibilityLabel={`${label}, ${isCurrent ? 'current set, ' : ''}${detail}`}
          >
            {row}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-SemiBold',
    flex: 1,
  },
  detail: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-Medium',
    fontVariant: ['tabular-nums'],
  },
});

export default SetDots;
