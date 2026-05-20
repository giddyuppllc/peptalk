/**
 * RestTimer — big countdown between sets.
 *
 * Renders the remaining seconds as M:SS with tabular figures, +30s and Skip
 * buttons, and a thin progress strip showing how far through the rest period
 * we are. Owns its own interval; calls onComplete() once when remaining hits
 * zero. The parent decides when to mount/unmount (eg after a successful
 * logSet) — that's the cue we use to know rest has started.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPress } from '../AnimatedPress';
import { FontSizes } from '../../constants/theme';
import { notifySuccess, tapLight } from '../../utils/haptics';

interface RestTimerProps {
  /** Total seconds the rest should run for */
  durationSeconds: number;
  accentColor: string;
  textColor: string;
  textMutedColor: string;
  surfaceColor: string;
  borderColor: string;
  onComplete?: () => void;
  onSkip?: () => void;
  /** Label above the timer (eg "Rest" or "Good work — rest") */
  label?: string;
}

export function RestTimer({
  durationSeconds,
  accentColor,
  textColor,
  textMutedColor,
  surfaceColor,
  borderColor,
  onComplete,
  onSkip,
  label = 'Rest',
}: RestTimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [total, setTotal] = useState(durationSeconds);
  const completedRef = useRef(false);

  // Reset when the parent hands us a new duration
  useEffect(() => {
    setRemaining(durationSeconds);
    setTotal(durationSeconds);
    completedRef.current = false;
  }, [durationSeconds]);

  // Tick once a second
  useEffect(() => {
    if (remaining <= 0) {
      if (!completedRef.current && total > 0) {
        completedRef.current = true;
        notifySuccess();
        onComplete?.();
      }
      return;
    }
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining, total, onComplete]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  const pct = total > 0 ? Math.min(100, ((total - remaining) / total) * 100) : 100;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: surfaceColor, borderColor },
      ]}
      accessibilityRole="timer"
      accessibilityLabel={`${label}, ${mins} minutes ${secs} seconds remaining`}
    >
      <View style={styles.headerRow}>
        <Ionicons name="timer-outline" size={16} color={accentColor} />
        <Text style={[styles.headerLabel, { color: textMutedColor }]}>
          {label}
        </Text>
      </View>
      <Text style={[styles.bigTime, { color: accentColor }]}>{formatted}</Text>
      <View style={[styles.track, { backgroundColor: accentColor + '22' }]}>
        <View
          style={[
            styles.fill,
            { width: `${pct}%`, backgroundColor: accentColor },
          ]}
        />
      </View>
      <View style={styles.buttonRow}>
        <AnimatedPress
          onPress={() => {
            tapLight();
            setTotal((t) => t + 30);
            setRemaining((r) => r + 30);
            completedRef.current = false;
          }}
          accessibilityRole="button"
          accessibilityLabel="Add 30 seconds to rest"
        >
          <View style={[styles.btn, { borderColor }]}>
            <Ionicons name="add" size={14} color={textColor} />
            <Text style={[styles.btnLabel, { color: textColor }]}>30s</Text>
          </View>
        </AnimatedPress>
        <AnimatedPress
          onPress={() => {
            tapLight();
            setRemaining(0);
            onSkip?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
        >
          <View style={[styles.btn, { borderColor }]}>
            <Ionicons name="play-skip-forward" size={14} color={textColor} />
            <Text style={[styles.btnLabel, { color: textColor }]}>Skip</Text>
          </View>
        </AnimatedPress>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerLabel: {
    fontSize: FontSizes.xs,
    fontFamily: 'DMSans-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bigTime: {
    fontSize: 44,
    fontFamily: 'DMSans-Bold',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  track: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  btnLabel: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-SemiBold',
  },
});

export default RestTimer;
