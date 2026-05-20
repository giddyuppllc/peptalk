/**
 * BodyCompositionHero — visual progress hero on Home.
 *
 * Reads from useBodyCompositionStore. When the user has at least one
 * scan it shows a 2D body silhouette (front view) tinted by InBody
 * segmental lean-mass data alongside their latest numbers + a 30-day
 * delta arrow. When empty, surfaces a "Log your first scan" CTA
 * pointing at the InBody manual-entry screen.
 *
 * Layout (populated): row split — silhouette (45%) | stat block (55%).
 * Empty state remains a single-row gradient nudge.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSectionAccent } from '../../hooks/useSectionAccent';
import { useBodyCompositionStore } from '../../store/useBodyCompositionStore';
import { Spacing } from '../../constants/theme';
import { selectionTick } from '../../utils/haptics';
import { BodySilhouette } from './BodySilhouette';

export const BodyCompositionHero: React.FC = () => {
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
        <View style={styles.heroEyebrowRow}>
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
          <Ionicons name="body" size={22} color="rgba(255,255,255,0.85)" />
        </View>

        <View style={styles.heroBodyRow}>
          {/* Silhouette — left 45%. Tinted by segmental lean mass when
              the latest scan carries it; otherwise outline-only. */}
          <View style={styles.silhouetteCol}>
            <BodySilhouette
              width={120}
              height={200}
              segmental={latest.segmental}
              accentColor="#FFFFFF"
            />
          </View>

          {/* Stat column — right 55%. Vertically stacked so the
              numbers stay legible at narrow widths. */}
          <View style={styles.statsCol}>
            {typeof latest.weightLb === 'number' && (
              <StackedStat
                label="Weight"
                value={`${latest.weightLb}`}
                unit="lb"
                delta={delta.weightLbDelta}
                deltaSuffix="lb"
                deltaGoodWhenNegative
              />
            )}
            {typeof latest.bodyFatPercent === 'number' && (
              <StackedStat
                label="Body fat"
                value={`${latest.bodyFatPercent}`}
                unit="%"
                delta={delta.bodyFatDelta}
                deltaSuffix="%"
                deltaGoodWhenNegative
              />
            )}
            {typeof latest.leanMassLb === 'number' && (
              <StackedStat
                label="Lean mass"
                value={`${latest.leanMassLb}`}
                unit="lb"
                delta={delta.leanMassDelta ?? null}
                deltaSuffix="lb"
                deltaGoodWhenNegative={false}
              />
            )}
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

/** Vertically stacked stat — sits in the right column next to the
 *  silhouette. Tighter spacing than the legacy horizontal Stat so we
 *  can show three readings in 200px of height. */
function StackedStat({
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
    <View style={styles.stackedStat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={styles.stackedStatValue}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
        {hasDelta && (
          <Text
            style={[
              styles.stackedStatDelta,
              { color: isGood ? '#9BE3B8' : '#F5C7C2' },
            ]}
          >
            {arrow}
            {Math.abs(delta).toFixed(1)}
          </Text>
        )}
      </View>
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
  heroEyebrowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  heroBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  silhouetteCol: {
    width: '45%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCol: {
    width: '55%',
    paddingLeft: Spacing.md,
    gap: 14,
  },
  stackedStat: {},
  stackedStatValue: {
    color: '#fff',
    fontFamily: 'DMSans-Bold',
    fontSize: 22,
  },
  stackedStatDelta: {
    fontFamily: 'DMSans-Medium',
    fontSize: 11,
    marginLeft: 'auto',
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
  statUnit: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'DMSans-Medium',
    fontSize: 12,
  },
});
