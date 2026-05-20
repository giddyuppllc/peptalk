/**
 * Mood & wellness — Master Refactor Plan v3.1 §5.2.
 *
 * Daily check-in surface. Trend line for mood across the last 30 days,
 * plus a per-entry history. Tapping the entry CTA routes to the
 * existing /(tabs)/check-in screen — this is the same data source so
 * we don't duplicate the input UI.
 */

import React, { useMemo } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline } from 'react-native-svg';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapMedium } from '../../src/utils/haptics';
import { useCheckinStore } from '../../src/store/useCheckinStore';

const MOOD_LABEL: Record<number, string> = {
  1: 'Rough',
  2: 'Off',
  3: 'Neutral',
  4: 'Good',
  5: 'Great',
};

export default function MoodTrackerScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const entries = useCheckinStore((s) => s.entries);

  const last30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    return entries
      .filter((e) => new Date(e.date).getTime() >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries]);

  const avg7 = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400_000;
    const within = entries.filter(
      (e) => new Date(e.date).getTime() >= cutoff,
    );
    if (within.length === 0) return null;
    return within.reduce((s, e) => s + e.mood, 0) / within.length;
  }, [entries]);

  const latest = entries[0];

  return (
    <V3DetailShell
      title="Mood & wellness"
      observation={
        entries.length === 0
          ? 'No check-ins yet. Daily mood + energy makes the rest of the data tell a story.'
          : avg7 != null
            ? `7-day mood average ${avg7.toFixed(1)} / 5.`
            : `Last check-in: ${latest!.date}.`
      }
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <Pressable
          onPress={() => {
            tapMedium();
            router.push('/(tabs)/check-in' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open today's daily check-in"
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.addRow}>
              <Ionicons
                name="add"
                size={20}
                color={t.colors.textPrimary as string}
              />
              <Text
                style={[
                  styles.addTitle,
                  {
                    color: t.colors.textPrimary as string,
                    fontFamily: t.typography.bodyBold,
                  },
                ]}
              >
                Open daily check-in
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={t.colors.textSecondary as string}
              />
            </View>
          </GlassCard>
        </Pressable>

        {last30.length >= 2 ? (
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
              30-DAY MOOD TREND
            </Text>
            <MoodTrend entries={last30} />
          </GlassCard>
        ) : null}

        {entries.length > 0 ? (
          <>
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
            {entries.slice(0, 30).map((e) => (
              <GlassCard key={e.id} style={styles.entryCard}>
                <View style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.entryMood,
                        {
                          color: t.colors.textPrimary as string,
                          fontFamily: t.typography.bodyBold,
                        },
                      ]}
                    >
                      Mood {e.mood} — {MOOD_LABEL[e.mood]}
                    </Text>
                    <Text
                      style={[
                        styles.entryMeta,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                    >
                      Energy {e.energy} · Stress {e.stress} · Sleep quality {e.sleepQuality}
                    </Text>
                    {e.notes ? (
                      <Text
                        style={[
                          styles.entryNotes,
                          {
                            color: t.colors.textSecondary as string,
                            fontFamily: t.typography.body,
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {e.notes}
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
                    {e.date}
                  </Text>
                </View>
              </GlassCard>
            ))}
          </>
        ) : null}
      </ScrollView>
    </V3DetailShell>
  );
}

function MoodTrend({ entries }: { entries: { date: string; mood: number }[] }) {
  const t = useV3Theme();
  const width = 300;
  const height = 90;
  const padding = 8;
  if (entries.length < 2) return null;
  const stepX = (width - padding * 2) / Math.max(1, entries.length - 1);
  const stroke = t.isDark
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentRose as string);
  const path = entries
    .map((e, i) => {
      const x = padding + i * stepX;
      // mood is 1-5; map to chart Y
      const y = height - padding - ((e.mood - 1) / 4) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <View style={{ alignItems: 'center', marginTop: 8 }}>
      <Svg width={width} height={height}>
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
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addTitle: { flex: 1, fontSize: 14 },
  statLabel: {
    fontSize: 9,
    letterSpacing: 1.4,
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
    alignItems: 'flex-start',
    gap: 10,
  },
  entryMood: { fontSize: 14 },
  entryMeta: { fontSize: 11, marginTop: 2 },
  entryNotes: { fontSize: 11, marginTop: 6, fontStyle: 'italic' },
});
