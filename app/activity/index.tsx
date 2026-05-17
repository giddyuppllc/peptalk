/**
 * Activity — Master Refactor Plan v3.1 §7.
 *
 * Three sub-tiles wrapped around an activity ring summary:
 *   1. Workouts entry (§7.1) — log / start program / your workouts
 *   2. Performance metrics (§7.2) — PRs, volume, strength trends
 *   3. Steps + active calories (§7.3) — HealthKit / Health Connect via
 *      useBiometricsStore
 */

import React, { useMemo } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  V3DetailShell,
  GlassCard,
  ActivityRings,
} from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight } from '../../src/utils/haptics';
import { useBiometricsStore } from '../../src/store/useBiometricsStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ringTargetForSteps(): number {
  return 8000;
}

function ringTargetForActiveCals(): number {
  return 500;
}

function ringTargetForExerciseMinutes(): number {
  return 30;
}

export default function ActivityScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const today = todayKey();
  const stepsReading = useBiometricsStore((s) => s.getReading(today, 'steps'));
  const activeCalsReading = useBiometricsStore((s) =>
    s.getReading(today, 'active_calories'),
  );
  const workouts = useWorkoutStore((s) => s.logs);
  const todayWorkouts = useMemo(
    () => workouts.filter((w) => w.date === today),
    [workouts, today],
  );
  const exerciseMinutesToday = todayWorkouts.reduce(
    (sum, w) => sum + (w.durationMinutes ?? 0),
    0,
  );
  const streak = useWorkoutStore((s) => s.getStreak());

  const steps = stepsReading?.value ?? 0;
  const activeCals = activeCalsReading?.value ?? 0;

  const observation = useMemo(() => {
    if (streak >= 3) return `${streak}-day workout streak. Keep it.`;
    if (todayWorkouts.length > 0) return 'Workout logged today. Nice.';
    if (steps >= ringTargetForSteps())
      return 'Steps target hit. One workout would lock it in.';
    return "Let's get a session in today.";
  }, [streak, todayWorkouts.length, steps]);

  return (
    <V3DetailShell
      title="Activity"
      observation={observation}
      intent="activity_overview"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Activity rings — Apple-style */}
        <GlassCard style={styles.cardSpacing}>
          <View style={styles.ringWrap}>
            <ActivityRings
              move={Math.min(
                100,
                (activeCals / ringTargetForActiveCals()) * 100,
              )}
              exercise={Math.min(
                100,
                (exerciseMinutesToday / ringTargetForExerciseMinutes()) * 100,
              )}
              stand={Math.min(100, (steps / ringTargetForSteps()) * 100)}
              size={140}
            />
            <View style={{ flex: 1, marginLeft: 18 }}>
              <RingRow
                label="Move"
                current={Math.round(activeCals)}
                target={ringTargetForActiveCals()}
                unit="cal"
                kind="move"
              />
              <RingRow
                label="Exercise"
                current={exerciseMinutesToday}
                target={ringTargetForExerciseMinutes()}
                unit="min"
                kind="exercise"
              />
              <RingRow
                label="Steps"
                current={Math.round(steps)}
                target={ringTargetForSteps()}
                unit=""
                kind="stand"
              />
            </View>
          </View>
        </GlassCard>

        {/* Workouts tile */}
        <Pressable
          onPress={() => {
            tapLight();
            router.push('/workouts' as never);
          }}
        >
          <GlassCard style={styles.cardSpacing}>
            <Tile
              icon="barbell-outline"
              title="Workouts"
              body="Log a session or follow Jamie's program."
            />
          </GlassCard>
        </Pressable>

        {/* Performance metrics tile */}
        <Pressable
          onPress={() => {
            tapLight();
            router.push('/activity/performance' as never);
          }}
        >
          <GlassCard style={styles.cardSpacing}>
            <Tile
              icon="trending-up-outline"
              title="Performance"
              body="PR tracking, strength trends, weekly volume."
            />
          </GlassCard>
        </Pressable>

        {/* History tile */}
        <Pressable
          onPress={() => {
            tapLight();
            router.push('/workouts/history' as never);
          }}
        >
          <GlassCard style={styles.cardSpacing}>
            <Tile
              icon="time-outline"
              title="History"
              body={`${workouts.length} workouts logged.`}
            />
          </GlassCard>
        </Pressable>

        {/* Integrations tile — HealthKit / Health Connect */}
        {!stepsReading ? (
          <Pressable
            onPress={() => {
              tapLight();
              router.push('/settings/integrations' as never);
            }}
          >
            <GlassCard style={styles.cardSpacing}>
              <Tile
                icon="pulse-outline"
                title="Connect a device"
                body="Pull steps + active calories from HealthKit / Health Connect."
              />
            </GlassCard>
          </Pressable>
        ) : null}
      </ScrollView>
    </V3DetailShell>
  );
}

function RingRow({
  label,
  current,
  target,
  unit,
  kind,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
  kind: 'move' | 'exercise' | 'stand';
}) {
  const t = useV3Theme();
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const color = (() => {
    if (t.isDark) {
      if (kind === 'move') return (t.colors as any).accentOxblood;
      if (kind === 'exercise') return (t.colors as any).accentCognac;
      return (t.colors as any).accentBone ?? (t.colors as any).textPrimary;
    }
    if (kind === 'move') return (t.colors as any).accentRose;
    if (kind === 'exercise') return (t.colors as any).accentMint;
    return (t.colors as any).accentLavender;
  })();
  return (
    <View style={styles.ringRow}>
      <View style={[styles.ringDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: t.typography.label,
            fontSize: 9,
            letterSpacing: 1.2,
            color: t.colors.textSecondary as string,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: t.typography.bodyMedium,
            fontSize: 12,
            color: t.colors.textPrimary as string,
            marginTop: 1,
          }}
        >
          {current}
          {target > 0 ? ` / ${target}` : ''}
          {unit ? ` ${unit}` : ''}
          {`  ·  ${Math.round(pct)}%`}
        </Text>
      </View>
    </View>
  );
}

function Tile({
  icon,
  title,
  body,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
}) {
  const t = useV3Theme();
  return (
    <View style={styles.tileRow}>
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
          name={icon}
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
            styles.tileTitle,
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
            styles.tileBody,
            {
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
            },
          ]}
        >
          {body}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={t.colors.textSecondary as string}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  ringWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  ringDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    fontSize: 17,
  },
  tileBody: {
    fontSize: 12,
    marginTop: 2,
  },
});
