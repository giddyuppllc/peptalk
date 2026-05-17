/**
 * Bloodwork — Master Refactor Plan v3.1 §10.
 *
 * Manual-entry first surface with trend-line cards per analyte. The
 * multi-modal ingest (photo OCR / PDF / CSV / email) lands on top of
 * this surface — manual entry is always one tap away per §10.1.
 *
 * Vendor parsers (LabCorp / Quest) and the OCR pipeline ship as
 * src/services/labParsers/*. This surface treats them as opaque pre-fill
 * sources — they call addResult() the same way manual entry does.
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
import Svg, { Polyline, Line } from 'react-native-svg';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import {
  useLabResultsStore,
  LAB_MARKERS,
} from '../../src/store/useLabResultsStore';

export default function LabsScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const results = useLabResultsStore((s) => s.results);

  const markersWithData = useMemo(() => {
    const ids = new Set(results.map((r) => r.markerId));
    return LAB_MARKERS.filter((m) => ids.has(m.id));
  }, [results]);

  const outOfRangeCount = useMemo(() => {
    let count = 0;
    for (const marker of markersWithData) {
      const latest = results
        .filter((r) => r.markerId === marker.id)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!latest) continue;
      if (marker.refLow != null && latest.value < marker.refLow) count++;
      if (marker.refHigh != null && latest.value > marker.refHigh) count++;
    }
    return count;
  }, [markersWithData, results]);

  const observation = useMemo(() => {
    if (results.length === 0)
      return 'No labs yet. Add a panel to start trending.';
    if (outOfRangeCount > 0)
      return `${outOfRangeCount} marker${outOfRangeCount === 1 ? '' : 's'} outside reference range.`;
    return `${markersWithData.length} marker${markersWithData.length === 1 ? '' : 's'} tracked. All in range.`;
  }, [results.length, outOfRangeCount, markersWithData.length]);

  return (
    <V3DetailShell
      title="Bloodwork"
      observation={observation}
      intent="open_chat"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Upload + manual entry tiles */}
        <Pressable
          onPress={() => {
            tapMedium();
            router.push('/labs/entry' as never);
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
                  Add a result
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
                  Manual entry, photo OCR, or PDF parser (LabCorp + Quest).
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

        {/* Trend cards per marker */}
        {markersWithData.length === 0 ? (
          <GlassCard style={styles.cardSpacing}>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              Add your first lab result above. Trend lines per analyte
              appear as soon as you have two or more draws.
            </Text>
          </GlassCard>
        ) : (
          markersWithData.map((marker) => {
            const history = results
              .filter((r) => r.markerId === marker.id)
              .sort((a, b) => a.date.localeCompare(b.date));
            const latest = history[history.length - 1];
            const isOut =
              (marker.refLow != null && latest.value < marker.refLow) ||
              (marker.refHigh != null && latest.value > marker.refHigh);
            return (
              <GlassCard
                key={marker.id}
                style={[
                  styles.cardSpacing,
                  isOut
                    ? {
                        borderWidth: 1,
                        borderColor: (t.colors as any).semanticDanger as string,
                      }
                    : undefined,
                ]}
              >
                <View style={styles.markerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.markerLabel,
                        {
                          color: t.colors.textPrimary as string,
                          fontFamily: t.isDark
                            ? t.typography.headlineMale
                            : t.typography.headlineFemale,
                        },
                      ]}
                    >
                      {marker.label}
                    </Text>
                    <Text
                      style={[
                        styles.markerRef,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                    >
                      Ref {marker.refLow ?? '—'}-{marker.refHigh ?? '—'}{' '}
                      {marker.unit}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={[
                        styles.markerValue,
                        {
                          color: isOut
                            ? ((t.colors as any).semanticDanger as string)
                            : (t.colors.textPrimary as string),
                          fontFamily: t.isDark
                            ? t.typography.headlineMale
                            : t.typography.headlineFemale,
                        },
                      ]}
                    >
                      {latest.value}
                    </Text>
                    <Text
                      style={{
                        color: t.colors.textSecondary as string,
                        fontFamily: t.typography.label,
                        fontSize: 9,
                        letterSpacing: 1.2,
                      }}
                    >
                      {marker.unit.toUpperCase()}
                    </Text>
                  </View>
                </View>
                {history.length >= 2 ? (
                  <MarkerTrend
                    values={history.map((r) => r.value)}
                    refLow={marker.refLow}
                    refHigh={marker.refHigh}
                  />
                ) : null}
                <Text
                  style={{
                    marginTop: 6,
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.body,
                    fontSize: 10,
                  }}
                >
                  {history.length} draw{history.length === 1 ? '' : 's'} ·
                  latest {latest.date}
                </Text>
              </GlassCard>
            );
          })
        )}
      </ScrollView>
    </V3DetailShell>
  );
}

function MarkerTrend({
  values,
  refLow,
  refHigh,
}: {
  values: number[];
  refLow?: number;
  refHigh?: number;
}) {
  const t = useV3Theme();
  const width = 280;
  const height = 80;
  const padding = 8;
  const all = [...values, refLow ?? values[0], refHigh ?? values[0]];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);
  const stepX = (width - padding * 2) / Math.max(1, values.length - 1);
  const toY = (v: number) =>
    height - padding - ((v - min) / span) * (height - padding * 2);
  const points = values
    .map((v, i) => `${padding + i * stepX},${toY(v)}`)
    .join(' ');
  const stroke = t.isDark
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentRose as string);
  return (
    <View style={{ marginTop: 8, alignItems: 'center' }}>
      <Svg width={width} height={height}>
        {refHigh != null ? (
          <Line
            x1={padding}
            y1={toY(refHigh)}
            x2={width - padding}
            y2={toY(refHigh)}
            stroke={(t.colors as any).semanticDanger as string}
            opacity={0.5}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}
        {refLow != null ? (
          <Line
            x1={padding}
            y1={toY(refLow)}
            x2={width - padding}
            y2={toY(refLow)}
            stroke={(t.colors as any).semanticDanger as string}
            opacity={0.5}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}
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
  markerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  markerLabel: { fontSize: 16 },
  markerRef: { fontSize: 11, marginTop: 2 },
  markerValue: { fontSize: 22 },
});
