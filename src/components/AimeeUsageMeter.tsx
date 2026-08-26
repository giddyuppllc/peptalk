/**
 * How much of this month's Aimee allowance is left.
 *
 * WHY THIS EXISTS
 * Until now the allowance was invisible. A subscriber used Aimee normally and
 * then, with no warning, hit a wall — no meter, no percentage, nothing
 * indicating a limit existed at all. Being cut off without notice is the worst
 * version of any usage model: people cannot ration what they cannot see, and
 * the first time they learn about it is when it stops working.
 *
 * Renders NOTHING when usage cannot be read. A meter that shows 0% because a
 * request failed says "carry on" at exactly the moment it does not know — the
 * opposite of the truth. Absence is honest; a wrong number is not.
 *
 * Renders nothing on free either. Free has no Aimee access, so a 0-of-0 meter
 * would be noise, and the paywall above it already makes the offer.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import {
  fetchAimeeUsage,
  usageSummary,
  USAGE_WARN_THRESHOLD,
  type AimeeUsage,
} from '../services/aimeeUsage';

export function AimeeUsageMeter() {
  const t = useTheme();
  const [usage, setUsage] = useState<AimeeUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const u = await fetchAimeeUsage();
      if (!active) return;
      setUsage(u);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={[styles.card, { borderColor: t.cardBorder, backgroundColor: t.card }]}>
        <ActivityIndicator size="small" color={t.textSecondary} />
      </View>
    );
  }

  // Unknown, or a tier with no allowance to report against.
  if (!usage || usage.tier === 'free' || usage.allowanceCents <= 0) return null;

  const over = usage.atLimit;
  const warn = !over && usage.percentUsed >= USAGE_WARN_THRESHOLD;
  const barColor = over ? '#C2564B' : warn ? '#B4802A' : t.primary;

  return (
    <View
      style={[styles.card, { borderColor: t.cardBorder, backgroundColor: t.card }]}
      accessibilityRole="progressbar"
      accessibilityLabel={usageSummary(usage)}
      accessibilityValue={{ min: 0, max: 100, now: usage.percentUsed }}
    >
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: t.text }]}>AI allowance</Text>
        <Text style={[styles.pct, { color: barColor }]}>{usage.percentUsed}%</Text>
      </View>

      <View style={[styles.track, { backgroundColor: t.cardBorder }]}>
        <View
          style={[
            styles.fill,
            // Always at least a sliver once anything has been used, so "barely
            // started" is visibly different from "not started".
            { width: `${usage.percentUsed > 0 ? Math.max(2, usage.percentUsed) : 0}%`, backgroundColor: barColor },
          ]}
        />
      </View>

      <Text style={[styles.summary, { color: over || warn ? barColor : t.textSecondary }]}>
        {usageSummary(usage)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 9,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700' },
  pct: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  summary: { fontSize: 12.5, lineHeight: 17 },
});

export default AimeeUsageMeter;
