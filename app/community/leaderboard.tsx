/**
 * Community leaderboard — real, opt-in, server-derived.
 *
 * Data: get_community_leaderboard / get_community_shoutouts /
 * get_my_leaderboard_metrics (migration 20260915200000). Only users who turned
 * on profiles.leaderboard_opt_in appear; blocked pairs are excluded both ways.
 * Nothing here is mock data — an empty board renders as an empty state.
 *
 * Anyone signed in can view the board. Appearing on it is the opt-in, which is
 * offered here, in onboarding, and in Profile → Public sharing.
 *
 * Reached from: the community feed header + strip, the nav sheet (navMap.ts),
 * Profile → Public sharing, and Aimee's `community-leaderboard` screen.
 *
 * All copy lives in src/constants/leaderboardCopy.ts.
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight } from '../../src/utils/haptics';
import { Alert } from '../../src/lib/alert';
import { useLeaderboardStore } from '../../src/store/useLeaderboardStore';
import { LEADERBOARD_METRICS, type LeaderboardMetric } from '../../src/lib/leaderboardMetrics';
import { LEADERBOARD_COPY, METRIC_COPY, formatMetricValue } from '../../src/constants/leaderboardCopy';
import {
  LeaderboardRowView,
  ShoutoutRowView,
  leaderboardName,
} from '../../src/components/community/LeaderboardParts';

const SHOUTOUT_PREVIEW = 5;

export default function LeaderboardScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const [metric, setMetric] = useState<LeaderboardMetric>('checkin_streak');

  const optIn = useLeaderboardStore((s) => s.optIn);
  const savingOptIn = useLeaderboardStore((s) => s.savingOptIn);
  const board = useLeaderboardStore((s) => s.boards[metric]);
  const shoutouts = useLeaderboardStore((s) => s.shoutouts);
  const myMetrics = useLeaderboardStore((s) => s.myMetrics);
  const loadOptIn = useLeaderboardStore((s) => s.loadOptIn);
  const setOptIn = useLeaderboardStore((s) => s.setOptIn);
  const loadBoard = useLeaderboardStore((s) => s.loadBoard);
  const loadShoutouts = useLeaderboardStore((s) => s.loadShoutouts);
  const loadMyMetrics = useLeaderboardStore((s) => s.loadMyMetrics);
  const hideUser = useLeaderboardStore((s) => s.hideUser);

  useEffect(() => {
    void loadOptIn();
    void loadMyMetrics();
    void loadShoutouts();
  }, [loadOptIn, loadMyMetrics, loadShoutouts]);

  useEffect(() => {
    void loadBoard(metric);
  }, [loadBoard, metric]);

  const toggleOptIn = async (next: boolean) => {
    tapLight();
    const ok = await setOptIn(next);
    if (!ok) Alert.alert(LEADERBOARD_COPY.settingsTitle, LEADERBOARD_COPY.settingsSaveFailed);
  };

  const confirmHide = (userId: string, name: string) => {
    Alert.alert(LEADERBOARD_COPY.hideTitle, `${name}\n\n${LEADERBOARD_COPY.hideBody}`, [
      { text: LEADERBOARD_COPY.hideCancel, style: 'cancel' },
      {
        text: LEADERBOARD_COPY.hideConfirm,
        style: 'destructive',
        onPress: async () => {
          const res = await hideUser(userId);
          if (!res.ok) Alert.alert(LEADERBOARD_COPY.hideTitle, LEADERBOARD_COPY.hideFailed);
        },
      },
    ]);
  };

  const headline = { color: t.colors.textPrimary as string, fontFamily: t.isDark ? t.typography.headlineMale : t.typography.headlineFemale };
  const body = { color: t.colors.textSecondary as string, fontFamily: t.typography.body };
  const positive = t.colors.semanticPositive as string;

  return (
    <V3DetailShell
      title={LEADERBOARD_COPY.screenTitle}
      observation={optIn ? LEADERBOARD_COPY.observationJoined : LEADERBOARD_COPY.observationNotJoined}
      intent="open_chat"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Opt-in */}
        <GlassCard style={styles.cardSpacing}>
          {optIn === null ? (
            <ActivityIndicator color={t.colors.textSecondary as string} />
          ) : optIn ? (
            <View style={styles.optRow}>
              <Ionicons name="checkmark-circle" size={20} color={positive} />
              <Text style={[styles.optTitle, headline, { flex: 1 }]}>{LEADERBOARD_COPY.joinedTitle}</Text>
              <Pressable
                onPress={() => void toggleOptIn(false)}
                disabled={savingOptIn}
                accessibilityRole="button"
                accessibilityLabel={LEADERBOARD_COPY.leaveButton}
                style={[styles.pill, { borderColor: t.colors.divider as string, opacity: savingOptIn ? 0.5 : 1 }]}
              >
                <Text style={{ color: t.colors.textPrimary as string, fontFamily: t.typography.bodyBold, fontSize: 12 }}>
                  {LEADERBOARD_COPY.leaveButton}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text style={[styles.optTitle, headline]}>{LEADERBOARD_COPY.joinTitle}</Text>
              <Text style={[styles.optBody, body]}>{LEADERBOARD_COPY.joinBody}</Text>
              <Pressable
                onPress={() => void toggleOptIn(true)}
                disabled={savingOptIn}
                accessibilityRole="button"
                accessibilityLabel={LEADERBOARD_COPY.joinTitle}
                style={[styles.pill, styles.joinPill, { borderColor: positive, backgroundColor: `${positive}22`, opacity: savingOptIn ? 0.5 : 1 }]}
              >
                <Text style={{ color: t.colors.textPrimary as string, fontFamily: t.typography.bodyBold, fontSize: 13 }}>
                  {LEADERBOARD_COPY.joinButton}
                </Text>
              </Pressable>
            </View>
          )}
        </GlassCard>

        {/* Metric picker */}
        <View style={styles.tabRow}>
          {LEADERBOARD_METRICS.map((m) => {
            const active = m === metric;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  tapLight();
                  setMetric(m);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.pill,
                  {
                    borderColor: active ? positive : (t.colors.divider as string),
                    backgroundColor: active ? `${positive}22` : 'transparent',
                  },
                ]}
              >
                <Text style={{ color: t.colors.textPrimary as string, fontFamily: active ? t.typography.bodyBold : t.typography.bodyMedium, fontSize: 12 }}>
                  {METRIC_COPY[m].label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Your numbers */}
        <GlassCard style={styles.cardSpacing}>
          <Text style={[styles.label, { color: t.colors.textSecondary as string, fontFamily: t.typography.label }]}>
            {LEADERBOARD_COPY.yourNumbers.toUpperCase()}
          </Text>
          <Text style={[styles.statValue, { color: t.colors.textPrimary as string, fontFamily: t.isDark ? t.typography.numeralsMale : t.typography.numeralsFemale }]}>
            {formatMetricValue(metric, myMetrics ? myMetrics[metric] : null)}
          </Text>
          <Text style={[styles.hint, body]}>
            {METRIC_COPY[metric].label} · {METRIC_COPY[metric].hint}
          </Text>
        </GlassCard>

        {/* The board */}
        <GlassCard style={styles.cardSpacing}>
          {board.status === 'loading' && board.rows.length === 0 ? (
            <ActivityIndicator color={t.colors.textSecondary as string} />
          ) : board.status === 'error' && board.rows.length === 0 ? (
            <Pressable onPress={() => void loadBoard(metric)} accessibilityRole="button" accessibilityLabel={LEADERBOARD_COPY.retry}>
              <Text style={[styles.center, headline, { fontSize: 15 }]}>{LEADERBOARD_COPY.loadFailed}</Text>
              <Text style={[styles.center, body, { marginTop: 4, fontSize: 12 }]}>{LEADERBOARD_COPY.retry}</Text>
            </Pressable>
          ) : board.rows.length === 0 ? (
            <Text style={[styles.center, body, { fontSize: 13 }]}>{LEADERBOARD_COPY.boardEmpty}</Text>
          ) : (
            board.rows.map((row) => (
              <LeaderboardRowView
                key={row.userId}
                row={row}
                valueLabel={formatMetricValue(metric, row.value)}
                onLongPress={() => confirmHide(row.userId, leaderboardName(row))}
              />
            ))
          )}
        </GlassCard>

        {/* Shout-outs */}
        <GlassCard style={styles.cardSpacing}>
          <Text style={[styles.optTitle, headline]}>{LEADERBOARD_COPY.shoutoutsTitle}</Text>
          {shoutouts.status === 'loading' && shoutouts.rows.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 10 }} color={t.colors.textSecondary as string} />
          ) : shoutouts.status === 'error' && shoutouts.rows.length === 0 ? (
            <Pressable onPress={() => void loadShoutouts()} accessibilityRole="button" accessibilityLabel={LEADERBOARD_COPY.retry}>
              <Text style={[body, { marginTop: 8, fontSize: 13 }]}>{LEADERBOARD_COPY.retry}</Text>
            </Pressable>
          ) : shoutouts.rows.length === 0 ? (
            <Text style={[body, { marginTop: 8, fontSize: 13 }]}>{LEADERBOARD_COPY.shoutoutsEmpty}</Text>
          ) : (
            shoutouts.rows.slice(0, SHOUTOUT_PREVIEW).map((row) => (
              <ShoutoutRowView
                key={`${row.userId}-${row.kind}-${row.threshold}-${row.achievedOn}`}
                row={row}
                onLongPress={() => confirmHide(row.userId, leaderboardName(row))}
              />
            ))
          )}
          <Pressable
            onPress={() => {
              tapLight();
              router.push('/community/milestones' as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={LEADERBOARD_COPY.allMilestones}
            style={styles.linkRow}
          >
            <Text style={{ color: t.colors.textSecondary as string, fontFamily: t.typography.bodyBold, fontSize: 12 }}>
              {LEADERBOARD_COPY.allMilestones}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={t.colors.textSecondary as string} />
          </Pressable>
        </GlassCard>
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optTitle: { fontSize: 16 },
  optBody: { marginTop: 6, fontSize: 13, lineHeight: 19 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  joinPill: { alignSelf: 'flex-start', marginTop: 12 },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  label: { fontSize: 9, letterSpacing: 1.4 },
  statValue: { fontSize: 34, marginTop: 6 },
  hint: { fontSize: 12, marginTop: 4 },
  center: { textAlign: 'center' },
  linkRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
});
