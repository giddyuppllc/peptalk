/**
 * Performance metrics — Master Refactor Plan v3.1 §7.2.
 *
 * PR tracking, strength trends, volume trends. Reads useWorkoutStore
 * for the entire log history and computes:
 *   - Top sets per exercise (best weight × reps + Epley 1RM estimate)
 *   - 8-week volume trend (total tonnage Σ weight × reps per week)
 *   - This week vs last week strength delta
 */

import React, { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { EXERCISES } from '../../src/data/exercises';
import Svg, { Polyline, Line } from 'react-native-svg';

/** Epley formula — most common 1RM estimator. */
function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

interface TopSet {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  oneRm: number;
  date: string;
}

export default function PerformanceScreen() {
  const t = useV3Theme();
  const logs = useWorkoutStore((s) => s.logs);
  const weeklyVolume = useWorkoutStore((s) => s.getWeeklyVolume(8));

  const topSets = useMemo<TopSet[]>(() => {
    const byExercise = new Map<string, TopSet>();
    for (const log of logs) {
      for (const set of log.sets) {
        if (!set.weightLbs || !set.completed) continue;
        const oneRm = estimate1RM(set.weightLbs, set.reps);
        const existing = byExercise.get(set.exerciseId);
        if (!existing || oneRm > existing.oneRm) {
          const exercise = EXERCISES.find((e) => e.id === set.exerciseId);
          byExercise.set(set.exerciseId, {
            exerciseId: set.exerciseId,
            exerciseName: exercise?.name ?? set.exerciseId,
            weight: set.weightLbs,
            reps: set.reps,
            oneRm,
            date: log.date,
          });
        }
      }
    }
    return Array.from(byExercise.values()).sort((a, b) => b.oneRm - a.oneRm);
  }, [logs]);

  const thisWeekVol = weeklyVolume[weeklyVolume.length - 1];
  const lastWeekVol = weeklyVolume[weeklyVolume.length - 2];
  const volDelta =
    thisWeekVol && lastWeekVol && lastWeekVol.totalWeightLbs > 0
      ? ((thisWeekVol.totalWeightLbs - lastWeekVol.totalWeightLbs) /
          lastWeekVol.totalWeightLbs) *
        100
      : null;

  const observation = useMemo(() => {
    if (logs.length === 0)
      return 'Log a few workouts and your PRs show up here.';
    if (volDelta != null && volDelta > 10)
      return `Volume up ${Math.round(volDelta)}% over last week.`;
    if (volDelta != null && volDelta < -15)
      return `Volume down ${Math.round(Math.abs(volDelta))}% — easy week?`;
    return `${topSets.length} exercise${topSets.length === 1 ? '' : 's'} with PRs tracked.`;
  }, [logs.length, volDelta, topSets.length]);

  return (
    <V3DetailShell
      title="Performance"
      observation={observation}
      intent="activity_performance"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Volume trend chart */}
        <GlassCard style={styles.cardSpacing}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: t.colors.textPrimary as string,
                fontFamily: t.isDark
                  ? t.typography.headlineMale
                  : t.typography.headlineFemale,
              },
            ]}
          >
            Volume — last 8 weeks
          </Text>
          <VolumeTrend volumes={weeklyVolume.map((v) => v.totalWeightLbs)} />
          {thisWeekVol ? (
            <View style={styles.statRow}>
              <Stat
                label="This week"
                value={`${Math.round(thisWeekVol.totalWeightLbs).toLocaleString()} lb`}
              />
              <Stat
                label="Sets"
                value={String(thisWeekVol.totalSets)}
              />
              <Stat
                label="Workouts"
                value={String(thisWeekVol.workoutCount)}
              />
            </View>
          ) : null}
        </GlassCard>

        {/* PRs by exercise */}
        <Text
          style={[
            styles.sectionHeader,
            {
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
            },
          ]}
        >
          Personal records
        </Text>
        {topSets.length === 0 ? (
          <GlassCard>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              Log weighted sets and your top set per exercise + estimated 1RM
              shows up here.
            </Text>
          </GlassCard>
        ) : (
          topSets.slice(0, 12).map((pr) => (
            <GlassCard key={pr.exerciseId} style={styles.prCard}>
              <View style={styles.prRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.prName,
                      {
                        color: t.colors.textPrimary as string,
                        fontFamily: t.typography.bodyBold,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {pr.exerciseName}
                  </Text>
                  <Text
                    style={[
                      styles.prMeta,
                      {
                        color: t.colors.textSecondary as string,
                        fontFamily: t.typography.body,
                      },
                    ]}
                  >
                    {pr.weight} lb × {pr.reps} · {pr.date}
                  </Text>
                </View>
                <View style={styles.prValue}>
                  <Text
                    style={[
                      styles.prRm,
                      {
                        color: t.colors.textPrimary as string,
                        fontFamily: t.isDark
                          ? t.typography.headlineMale
                          : t.typography.headlineFemale,
                      },
                    ]}
                  >
                    {Math.round(pr.oneRm)}
                  </Text>
                  <Text
                    style={{
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.label,
                      fontSize: 9,
                      letterSpacing: 1.2,
                    }}
                  >
                    EST 1RM
                  </Text>
                </View>
              </View>
            </GlassCard>
          ))
        )}
      </ScrollView>
    </V3DetailShell>
  );
}

function VolumeTrend({ volumes }: { volumes: number[] }) {
  const t = useV3Theme();
  const width = 300;
  const height = 100;
  const padding = 8;
  if (volumes.length === 0 || volumes.every((v) => v === 0)) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text
          style={{
            color: t.colors.textSecondary as string,
            fontFamily: t.typography.body,
            fontSize: 11,
          }}
        >
          Not enough data yet.
        </Text>
      </View>
    );
  }
  const max = Math.max(...volumes, 1);
  const stepX = (width - padding * 2) / Math.max(1, volumes.length - 1);
  const points = volumes
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = height - padding - (v / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
  const stroke = t.isDark
    ? ((t.colors as any).accentCognac as string)
    : ((t.colors as any).accentRose as string);
  return (
    <View style={{ marginVertical: 10, alignItems: 'center' }}>
      <Svg width={width} height={height}>
        <Line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="rgba(0,0,0,0.10)"
          strokeWidth={1}
        />
        <Polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useV3Theme();
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          color: t.colors.textSecondary as string,
          fontFamily: t.typography.label,
          fontSize: 9,
          letterSpacing: 1.2,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          color: t.colors.textPrimary as string,
          fontFamily: t.isDark
            ? t.typography.headlineMale
            : t.typography.headlineFemale,
          fontSize: 15,
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  sectionTitle: {
    fontSize: 16,
  },
  sectionHeader: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
  },
  statRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 14,
  },
  prCard: {
    marginBottom: 10,
  },
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  prName: {
    fontSize: 14,
  },
  prMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  prValue: {
    alignItems: 'flex-end',
  },
  prRm: {
    fontSize: 22,
  },
});
