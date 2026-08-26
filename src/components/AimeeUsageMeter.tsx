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
 * Free IS shown — it has three prompts a month, and the whole point of a
 * taster is that the person can see it running out and decide before it does.
 * Free is metered in messages rather than cents, because a percentage of a few
 * cents tells that user nothing.
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

  if (!usage) return null;

  // Free is metered in MESSAGES, not cents. Three prompts a month expressed as
  // a percentage of a few cents would be noise; the count is the fact that
  // matters, and it has to be visible BEFORE the last one is spent.
  const meteredOnMessages = usage.tier === 'free' && usage.messageLimit > 0;

  // Nothing to report against on either axis.
  if (!meteredOnMessages && usage.allowanceCents <= 0) return null;

  const pct = meteredOnMessages
    ? Math.min(100, Math.round((usage.messagesUsed / usage.messageLimit) * 100))
    : usage.percentUsed;
  const over = meteredOnMessages ? usage.messagesRemaining <= 0 : usage.atLimit;
  const warn = !over && pct >= USAGE_WARN_THRESHOLD;
  const barColor = over ? '#C2564B' : warn ? '#B4802A' : t.primary;

  return (
    <View
      style={[styles.card, { borderColor: t.cardBorder, backgroundColor: t.card }]}
      accessibilityRole="progressbar"
      accessibilityLabel={usageSummary(usage)}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: t.text }]}>
          {meteredOnMessages ? 'Free Aimee messages' : 'AI allowance'}
        </Text>
        <Text style={[styles.pct, { color: barColor }]}>
          {meteredOnMessages
            ? `${usage.messagesUsed}/${usage.messageLimit}`
            : `${pct}%`}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: t.cardBorder }]}>
        <View
          style={[
            styles.fill,
            // Always at least a sliver once anything has been used, so "barely
            // started" is visibly different from "not started".
            { width: `${pct > 0 ? Math.max(2, pct) : 0}%`, backgroundColor: barColor },
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
