/**
 * Body Composition — Master Refactor Plan v3.1 §10.3.
 *
 * Trend lines for lean mass, fat mass, body fat %, skeletal muscle mass.
 * Manual entry is one tap away. The InBody PDF parser (270/570/770)
 * lives in src/services/labParsers/inbody.ts and writes through the
 * same addScan() API the manual form uses.
 */

import React, { useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline } from 'react-native-svg';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapMedium } from '../../src/utils/haptics';
import { useBodyCompositionStore } from '../../src/store/useBodyCompositionStore';
import { confirmDelete, describeDate } from '../../src/lib/confirmDelete';
import type { BodyCompositionScan } from '../../src/store/useBodyCompositionStore';

/**
 * Scans are stored as a full ISO timestamp, not a plain date, so the shared
 * describeDate (which expects YYYY-MM-DD) is fed just the date part.
 */
function describeScanDate(scannedAt: string): string {
  return describeDate((scannedAt || '').slice(0, 10));
}

export default function BodyCompositionScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const scans = useBodyCompositionStore((s) => s.scans);
  // A duplicated or mistyped scan bends every trend line above it, and until
  // now there was no way to see an individual scan, let alone remove one.
  const deleteScan = useBodyCompositionStore((s) => s.deleteScan);
  // 2026-05-17 P0 fix: pulling `deltaWindow(90)` through the selector
  // returned a fresh `{ weightLbDelta, bodyFatDelta, leanMassDelta }`
  // literal on every render — Zustand Object.is saw it as changed and
  // looped. Pull the accessor function (stable ref) and call it in
  // useMemo keyed on the raw scans array.
  const deltaWindow = useBodyCompositionStore((s) => s.deltaWindow);
  const delta90d = useMemo(
    () => deltaWindow(90),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deltaWindow, scans],
  );
  const sorted = useMemo(
    () =>
      [...scans].sort(
        (a, b) =>
          new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime(),
      ),
    [scans],
  );

  const observation = useMemo(() => {
    if (scans.length === 0)
      return 'No scans yet. Add your first to start trending.';
    const { weightLbDelta, leanMassDelta } = delta90d;
    if (leanMassDelta != null && leanMassDelta > 1) {
      return `Lean mass up ${leanMassDelta.toFixed(1)} lb over 90 days. Nice.`;
    }
    if (weightLbDelta != null && weightLbDelta < -2) {
      return `Weight down ${Math.abs(weightLbDelta).toFixed(1)} lb over 90 days.`;
    }
    return `${scans.length} scan${scans.length === 1 ? '' : 's'} on file.`;
  }, [scans.length, delta90d]);

  return (
    <V3DetailShell
      title="Body composition"
      observation={observation}
      intent="open_chat"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <Pressable
          onPress={() => {
            tapMedium();
            router.push('/body-composition/entry' as never);
          }}
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.entryRow}>
              <View
                style={[
                  styles.iconBubble,
                  {
                    backgroundColor: t.isDark
                      ? 'rgba(201,136,90,0.18)'
                      : 'rgba(229,146,141,0.22)',
                  },
                ]}
              >
                <Ionicons
                  name="add"
                  size={22}
                  color={
                    t.isDark
                      ? ((t.colors as any).accentCognac as string)
                      : ((t.colors as any).accentRose as string)
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.entryTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  Add a scan
                </Text>
                <Text
                  style={[
                    styles.entryBody,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  InBody 270 / 570 / 770 PDF, smart scale, or manual entry.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={t.colors.textSecondary as string}
              />
            </View>
          </GlassCard>
        </Pressable>

        {scans.length === 0 ? (
          <GlassCard style={styles.cardSpacing}>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              Add your first scan above. Trend lines appear with two or
              more readings.
            </Text>
          </GlassCard>
        ) : (
          <>
            <TrendCard
              title="Weight"
              unit="lb"
              values={sorted
                .map((s) => s.weightLb)
                .filter((v): v is number => v != null)}
            />
            <TrendCard
              title="Body fat"
              unit="%"
              values={sorted
                .map((s) => s.bodyFatPercent)
                .filter((v): v is number => v != null)}
            />
            <TrendCard
              title="Lean mass"
              unit="lb"
              values={sorted
                .map((s) => s.leanMassLb)
                .filter((v): v is number => v != null)}
            />
            <TrendCard
              title="Fat mass"
              unit="lb"
              values={sorted
                .map((s) => s.fatMassLb)
                .filter((v): v is number => v != null)}
            />
            <ScanHistory scans={sorted} onDelete={deleteScan} />
          </>
        )}
      </ScrollView>
    </V3DetailShell>
  );
}

/**
 * The individual scans behind the trend lines.
 *
 * The screen previously showed only aggregates, so a scan entered twice or
 * with a fat-free mass typo was invisible -- the user could see the trend was
 * wrong but had no way to find or fix the reading causing it. Newest first,
 * because that is the one most likely to have just been mistyped.
 */
function ScanHistory({
  scans,
  onDelete,
}: {
  scans: BodyCompositionScan[];
  onDelete: (id: string) => void;
}) {
  const t = useV3Theme();
  if (scans.length === 0) return null;
  const newestFirst = [...scans].reverse();
  return (
    <GlassCard style={styles.cardSpacing}>
      <Text
        style={{
          color: t.colors.textPrimary as string,
          fontFamily: t.typography.body,
          fontSize: 15,
          fontWeight: '700',
          marginBottom: 10,
        }}
      >
        Scan history
      </Text>
      {newestFirst.map((sc, i) => (
        <View
          key={sc.id}
          style={[
            styles.scanRow,
            i < newestFirst.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: 'rgba(127,127,127,0.22)',
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: t.colors.textPrimary as string,
                fontFamily: t.typography.body,
                fontSize: 13.5,
              }}
            >
              {describeScanDate(sc.scannedAt)}
            </Text>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 12,
                marginTop: 2,
              }}
            >
              {[
                sc.weightLb != null ? `${sc.weightLb} lb` : null,
                sc.bodyFatPercent != null ? `${sc.bodyFatPercent}% fat` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'No measurements recorded'}
            </Text>
          </View>
          <Pressable
            onPress={() =>
              confirmDelete({
                subject: `the scan from ${describeScanDate(sc.scannedAt)}`,
                consequence: 'Your trend lines will be recalculated without it.',
                onConfirm: () => onDelete(sc.id),
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Delete the scan from ${describeScanDate(sc.scannedAt)}`}
            hitSlop={10}
            style={styles.scanDelete}
          >
            <Ionicons
              name="trash-outline"
              size={17}
              color={t.colors.textSecondary as string}
            />
          </Pressable>
        </View>
      ))}
    </GlassCard>
  );
}

function TrendCard({
  title,
  unit,
  values,
}: {
  title: string;
  unit: string;
  values: number[];
}) {
  const t = useV3Theme();
  if (values.length === 0) return null;
  const latest = values[values.length - 1];
  const first = values[0];
  const delta = values.length >= 2 ? latest - first : null;
  return (
    <GlassCard style={styles.cardSpacing}>
      <View style={styles.trendHeader}>
        <View>
          <Text
            style={[
              styles.trendTitle,
              {
                color: t.colors.textPrimary as string,
                fontFamily: t.isDark
                  ? t.typography.headlineMale
                  : t.typography.headlineFemale,
              },
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.trendValue,
              {
                color: t.colors.textPrimary as string,
                fontFamily: t.isDark
                  ? t.typography.numeralsMale
                  : t.typography.numeralsFemale,
              },
            ]}
          >
            {latest.toFixed(1)} {unit}
          </Text>
        </View>
        {delta != null ? (
          <Text
            style={{
              color: (t.colors as any)[
                delta < 0 ? 'semanticPositive' : 'semanticWarn'
              ] as string,
              fontFamily: t.typography.bodyBold,
              fontSize: 12,
            }}
          >
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)} {unit}
          </Text>
        ) : null}
      </View>
      {values.length >= 2 ? <CompTrend values={values} /> : null}
    </GlassCard>
  );
}

function CompTrend({ values }: { values: number[] }) {
  const t = useV3Theme();
  const width = 280;
  const height = 80;
  const padding = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.1, max - min);
  const stepX = (width - padding * 2) / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((v - min) / span) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
  const stroke = t.isDark
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentRose as string);
  return (
    <View style={{ marginTop: 8, alignItems: 'center' }}>
      <Svg width={width} height={height}>
        <Polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  scanRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  scanDelete: { padding: 6 },
  cardSpacing: { marginTop: 12 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryTitle: { fontSize: 17 },
  entryBody: { fontSize: 12, marginTop: 2 },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  trendTitle: { fontSize: 14 },
  trendValue: {
    fontSize: 24,
    marginTop: 2,
  },
});
