/**
 * BodyCompositionHero — visual progress hero on Home.
 *
 * Reads from useBodyCompositionStore. When the user has at least one
 * scan it shows their latest numbers + a 30-day delta arrow. When
 * empty, surfaces a "Log your first scan" CTA pointing at the InBody
 * manual-entry screen.
 *
 * Future enhancement (Phase 5.5): swap the placeholder body card for
 * a 2D SVG silhouette colored by segmental lean-mass data.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useSectionAccent } from '../../hooks/useSectionAccent';
import { useBodyCompositionStore } from '../../store/useBodyCompositionStore';
import { FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { selectionTick } from '../../utils/haptics';

export const BodyCompositionHero: React.FC = () => {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();

  const latest = useBodyCompositionStore((s) => s.latestScan());
  const delta = useBodyCompositionStore((s) => s.deltaWindow(30));

  const open = () => {
    selectionTick();
    router.push('/settings/inbody-entry' as never);
  };

  // Empty state — no scans yet.
  if (!latest) {
    return (
      <TouchableOpacity
        onPress={open}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel="Log your first body composition scan"
        style={styles.wrap}
      >
        <LinearGradient
          colors={[accent.pastel, accent.deep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.grad}
        >
          <Ionicons name="body" size={36} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyTitle}>Log your first scan</Text>
            <Text style={styles.emptySub}>
              Punch in weight + body fat % from your InBody printout to start tracking.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.85)" />
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  // Populated state — show latest scan summary + delta arrows.
  const scanDate = new Date(latest.scannedAt);
  const daysAgo = Math.max(
    0,
    Math.floor((Date.now() - scanDate.getTime()) / 86_400_000),
  );

  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.86}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel="View body composition history"
    >
      <LinearGradient
        colors={[accent.pastel, accent.deep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.grad}
      >
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroEyebrow}>Body composition</Text>
            <Text style={styles.heroDate}>
              {daysAgo === 0
                ? 'Scanned today'
                : daysAgo === 1
                  ? 'Scanned yesterday'
                  : `Scanned ${daysAgo} days ago`}
            </Text>
          </View>
          <Ionicons name="body" size={28} color="rgba(255,255,255,0.85)" />
        </View>

        <View style={styles.heroStatsRow}>
          {typeof latest.weightLb === 'number' && (
            <Stat
              label="Weight"
              value={`${latest.weightLb}`}
              unit="lb"
              delta={delta.weightLbDelta}
              deltaSuffix="lb"
              deltaGoodWhenNegative
            />
          )}
          {typeof latest.bodyFatPercent === 'number' && (
            <Stat
              label="Body fat"
              value={`${latest.bodyFatPercent}`}
              unit="%"
              delta={delta.bodyFatDelta}
              deltaSuffix="%"
              deltaGoodWhenNegative
            />
          )}
          {typeof latest.leanMassLb === 'number' && (
            <Stat
              label="Lean mass"
              value={`${latest.leanMassLb}`}
              unit="lb"
              delta={delta.leanMassDelta ?? null}
              deltaSuffix="lb"
              deltaGoodWhenNegative={false}
            />
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

function Stat({
  label,
  value,
  unit,
  delta,
  deltaSuffix,
  deltaGoodWhenNegative,
}: {
  label: string;
  value: string;
  unit: string;
  delta: number | null;
  deltaSuffix: string;
  deltaGoodWhenNegative: boolean;
}) {
  const hasDelta = typeof delta === 'number' && delta !== 0;
  const isGood = hasDelta && (deltaGoodWhenNegative ? delta < 0 : delta > 0);
  const arrow = !hasDelta ? '' : delta > 0 ? '↑' : '↓';
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
      </View>
      {hasDelta && (
        <Text
          style={[
            styles.statDelta,
            { color: isGood ? '#9BE3B8' : '#F5C7C2' },
          ]}
        >
          {arrow} {Math.abs(delta).toFixed(1)} {deltaSuffix} · 30d
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    marginBottom: Spacing.lg,
  },
  grad: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    color: '#fff',
    fontFamily: 'DMSans-Bold',
    fontSize: 16,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  emptySub: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'DMSans-Bold',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroDate: {
    color: '#fff',
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'DMSans-Medium',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statValue: {
    color: '#fff',
    fontFamily: 'DMSans-Bold',
    fontSize: 26,
  },
  statUnit: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'DMSans-Medium',
    fontSize: 12,
  },
  statDelta: {
    fontFamily: 'DMSans-Medium',
    fontSize: 11,
    marginTop: 4,
  },
});
