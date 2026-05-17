/**
 * Sleep tracker — Master Refactor Plan v3.1 §5.2.
 *
 * Duration + stage breakdown trend, pulled from useBiometricsStore
 * (sleep_minutes, sleep_deep_minutes, sleep_rem_minutes). Read-only
 * surface — sleep entries are written by the HealthKit / Health
 * Connect adapter, never manually here, so no entry CTA.
 */

import React, { useMemo } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Line } from 'react-native-svg';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight } from '../../src/utils/haptics';
import { useBiometricsStore } from '../../src/store/useBiometricsStore';

interface SleepNight {
  date: string;
  hours: number;
  deepMin?: number;
  remMin?: number;
}

export default function SleepTrackerScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const readings = useBiometricsStore((s) => s.readings);

  const nights = useMemo<SleepNight[]>(() => {
    const byDate = new Map<string, SleepNight>();
    for (const r of readings) {
      if (r.scope === 'sleep_minutes') {
        const cur = byDate.get(r.date) ?? {
          date: r.date,
          hours: 0,
        };
        cur.hours = r.value / 60;
        byDate.set(r.date, cur);
      } else if (r.scope === 'sleep_deep_minutes') {
        const cur = byDate.get(r.date) ?? { date: r.date, hours: 0 };
        cur.deepMin = r.value;
        byDate.set(r.date, cur);
      } else if (r.scope === 'sleep_rem_minutes') {
        const cur = byDate.get(r.date) ?? { date: r.date, hours: 0 };
        cur.remMin = r.value;
        byDate.set(r.date, cur);
      }
    }
    return Array.from(byDate.values())
      .filter((n) => n.hours > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [readings]);

  const avg7 = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400_000;
    const within = nights.filter(
      (n) => new Date(n.date).getTime() >= cutoff,
    );
    if (within.length === 0) return null;
    return within.reduce((s, n) => s + n.hours, 0) / within.length;
  }, [nights]);

  const latest = nights[nights.length - 1];

  return (
    <V3DetailShell
      title="Sleep"
      observation={
        nights.length === 0
          ? 'No sleep data. Connect HealthKit or Health Connect to pull it.'
          : avg7 != null
            ? `${avg7.toFixed(1)} hr / night average over 7 days.`
            : `Latest ${latest!.hours.toFixed(1)} hr on ${latest!.date}.`
      }
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {nights.length === 0 ? (
          <Pressable
            onPress={() => {
              tapLight();
              router.push('/settings/integrations' as never);
            }}
            accessibilityRole="button"
            accessibilityLabel="Connect HealthKit or Health Connect to pull sleep"
          >
            <GlassCard style={styles.cardSpacing}>
              <View style={styles.connectRow}>
                <Ionicons
                  name="pulse-outline"
                  size={20}
                  color={t.colors.textPrimary as string}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.connectTitle,
                      {
                        color: t.colors.textPrimary as string,
                        fontFamily: t.isDark
                          ? t.typography.headlineMale
                          : t.typography.headlineFemale,
                      },
                    ]}
                  >
                    Connect a sleep source
                  </Text>
                  <Text
                    style={[
                      styles.connectBody,
                      {
                        color: t.colors.textSecondary as string,
                        fontFamily: t.typography.body,
                      },
                    ]}
                  >
                    HealthKit, Health Connect, Oura, Whoop, or Garmin.
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={t.colors.textSecondary as string}
                />
              </View>
            </GlassCard>
          </Pressable>
        ) : (
          <>
            <GlassCard style={styles.cardSpacing}>
              <Text
                style={[
                  styles.statLabel,
                  {
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.label,
                  },
                ]}
              >
                LAST NIGHT
              </Text>
              <Text
                style={[
                  styles.statValue,
                  {
                    color: t.colors.textPrimary as string,
                    fontFamily: t.isDark
                      ? t.typography.numeralsMale
                      : t.typography.numeralsFemale,
                  },
                ]}
              >
                {latest!.hours.toFixed(1)} hr
              </Text>
              <Text
                style={[
                  styles.statHint,
                  {
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.body,
                  },
                ]}
              >
                {latest!.deepMin != null
                  ? `${latest!.deepMin}m deep`
                  : ''}
                {latest!.deepMin != null && latest!.remMin != null ? ' · ' : ''}
                {latest!.remMin != null ? `${latest!.remMin}m REM` : ''}
              </Text>
              <SleepTrend nights={nights} />
            </GlassCard>

            <Text
              style={[
                styles.sectionHeader,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              History
            </Text>
            {[...nights].reverse().slice(0, 30).map((n) => (
              <GlassCard key={n.date} style={styles.entryCard}>
                <View style={styles.entryRow}>
                  <View>
                    <Text
                      style={{
                        color: t.colors.textPrimary as string,
                        fontFamily: t.typography.bodyBold,
                        fontSize: 14,
                      }}
                    >
                      {n.hours.toFixed(1)} hr
                    </Text>
                    {(n.deepMin != null || n.remMin != null) ? (
                      <Text
                        style={{
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                          fontSize: 11,
                          marginTop: 2,
                        }}
                      >
                        {n.deepMin != null ? `${n.deepMin}m deep` : ''}
                        {n.deepMin != null && n.remMin != null ? ' · ' : ''}
                        {n.remMin != null ? `${n.remMin}m REM` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={{
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                      fontSize: 12,
                    }}
                  >
                    {n.date}
                  </Text>
                </View>
              </GlassCard>
            ))}
          </>
        )}
      </ScrollView>
    </V3DetailShell>
  );
}

function SleepTrend({ nights }: { nights: SleepNight[] }) {
  const t = useV3Theme();
  const width = 300;
  const height = 110;
  const padding = 10;
  if (nights.length < 2) return null;
  const values = nights.map((n) => n.hours);
  const min = Math.min(...values, 4);
  const max = Math.max(...values, 9);
  const span = Math.max(0.1, max - min);
  const stepX = (width - padding * 2) / Math.max(1, nights.length - 1);
  const stroke = t.isDark
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentLavender as string);
  const path = nights
    .map((n, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((n.hours - min) / span) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
  // 8-hour reference line
  const eightY = height - padding - ((8 - min) / span) * (height - padding * 2);
  return (
    <View style={{ alignItems: 'center', marginTop: 14 }}>
      <Svg width={width} height={height}>
        {eightY > padding && eightY < height - padding ? (
          <Line
            x1={padding}
            y1={eightY}
            x2={width - padding}
            y2={eightY}
            stroke={(t.colors as any).divider as string}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}
        <Polyline
          points={path}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectTitle: { fontSize: 16 },
  connectBody: { fontSize: 12, marginTop: 2 },
  statLabel: {
    fontSize: 9,
    letterSpacing: 1.4,
  },
  statValue: {
    fontSize: 38,
    marginTop: 6,
  },
  statHint: {
    fontSize: 12,
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
  },
  entryCard: {
    marginBottom: 8,
    paddingVertical: 12,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
