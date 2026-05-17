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
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { useBodyCompositionStore } from '../../src/store/useBodyCompositionStore';

export default function BodyCompositionScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const scans = useBodyCompositionStore((s) => s.scans);
  const delta90d = useBodyCompositionStore((s) => s.deltaWindow(90));
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
          </>
        )}
      </ScrollView>
    </V3DetailShell>
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
              color: delta < 0 ? '#6FA891' : '#D08850',
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
