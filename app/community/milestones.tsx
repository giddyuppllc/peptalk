/**
 * Milestones — community shout-outs plus the user's own milestones.
 *
 * Community shout-outs come from get_community_shoutouts (migration
 * 20260915200000): real milestone events — a check-in streak crossing a badge
 * threshold, a first or tenth workout — for users who opted in to the
 * leaderboard. No mock entries; an empty list renders as an empty state.
 *
 * "Your milestones" is computed on this device from the user's own stores
 * (services/milestones.ts) and is visible only to them. It is never sent to
 * the leaderboard — it can include compound names and lab values.
 *
 * All leaderboard copy lives in src/constants/leaderboardCopy.ts.
 */

import React, { useEffect, useMemo } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight } from '../../src/utils/haptics';
import { Alert } from '../../src/lib/alert';
import { computeMilestones, type Milestone } from '../../src/services/milestones';
import {
  useReactionsStore,
  REACTION_LABELS,
  type ReactionKind,
} from '../../src/store/useReactionsStore';
import { useLeaderboardStore } from '../../src/store/useLeaderboardStore';
import { LEADERBOARD_COPY } from '../../src/constants/leaderboardCopy';
import { ShoutoutRowView, leaderboardName } from '../../src/components/community/LeaderboardParts';

const KIND_ICON: Record<Milestone['kind'], React.ComponentProps<typeof Ionicons>['name']> = {
  dose_streak: 'flame-outline',
  workout_streak: 'barbell-outline',
  cycle_complete: 'checkmark-done-outline',
  pr_set: 'trophy-outline',
  lab_improvement: 'flask-outline',
  lean_mass_gain: 'body-outline',
};

const REACTION_ORDER: ReactionKind[] = ['clap', 'muscle', 'target'];

export default function MilestonesScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const milestones = useMemo(() => computeMilestones(), []);
  const optIn = useLeaderboardStore((s) => s.optIn);
  const savingOptIn = useLeaderboardStore((s) => s.savingOptIn);
  const shoutouts = useLeaderboardStore((s) => s.shoutouts);
  const loadOptIn = useLeaderboardStore((s) => s.loadOptIn);
  const loadShoutouts = useLeaderboardStore((s) => s.loadShoutouts);
  const setOptIn = useLeaderboardStore((s) => s.setOptIn);
  const hideUser = useLeaderboardStore((s) => s.hideUser);

  useEffect(() => {
    void loadOptIn();
    void loadShoutouts();
  }, [loadOptIn, loadShoutouts]);

  const headline = {
    color: t.colors.textPrimary as string,
    fontFamily: t.isDark ? t.typography.headlineMale : t.typography.headlineFemale,
  };
  const body = { color: t.colors.textSecondary as string, fontFamily: t.typography.body };
  const positive = t.colors.semanticPositive as string;

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

  return (
    <V3DetailShell
      title={LEADERBOARD_COPY.milestonesTitle}
      observation={LEADERBOARD_COPY.milestonesObservation}
      intent="open_chat"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Community shout-outs */}
        <GlassCard style={styles.cardSpacing}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, headline]}>{LEADERBOARD_COPY.communityShoutoutsTitle}</Text>
            <Pressable
              onPress={() => {
                tapLight();
                router.push('/community/leaderboard' as never);
              }}
              accessibilityRole="button"
              accessibilityLabel={LEADERBOARD_COPY.feedEntryA11y}
              hitSlop={8}
            >
              <Ionicons name="trophy-outline" size={18} color={t.colors.textSecondary as string} />
            </Pressable>
          </View>
          {shoutouts.status === 'loading' && shoutouts.rows.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 10 }} color={t.colors.textSecondary as string} />
          ) : shoutouts.status === 'error' && shoutouts.rows.length === 0 ? (
            <Pressable onPress={() => void loadShoutouts()} accessibilityRole="button" accessibilityLabel={LEADERBOARD_COPY.retry}>
              <Text style={[body, styles.small]}>{LEADERBOARD_COPY.retry}</Text>
            </Pressable>
          ) : shoutouts.rows.length === 0 ? (
            <Text style={[body, styles.small]}>{LEADERBOARD_COPY.shoutoutsEmpty}</Text>
          ) : (
            shoutouts.rows.map((row) => (
              <ShoutoutRowView
                key={`${row.userId}-${row.kind}-${row.threshold}-${row.achievedOn}`}
                row={row}
                onLongPress={() => confirmHide(row.userId, leaderboardName(row))}
              />
            ))
          )}
        </GlassCard>

        {/* Join, when not on the board */}
        {optIn === false ? (
          <GlassCard style={styles.cardSpacing}>
            <Text style={[styles.sectionTitle, headline]}>{LEADERBOARD_COPY.joinTitle}</Text>
            <Text style={[body, styles.small]}>{LEADERBOARD_COPY.joinBody}</Text>
            <Pressable
              onPress={async () => {
                tapLight();
                const ok = await setOptIn(true);
                if (!ok) Alert.alert(LEADERBOARD_COPY.settingsTitle, LEADERBOARD_COPY.settingsSaveFailed);
              }}
              disabled={savingOptIn}
              accessibilityRole="button"
              accessibilityLabel={LEADERBOARD_COPY.joinTitle}
              style={[styles.joinPill, { borderColor: positive, backgroundColor: `${positive}22`, opacity: savingOptIn ? 0.5 : 1 }]}
            >
              <Text style={{ color: t.colors.textPrimary as string, fontFamily: t.typography.bodyBold, fontSize: 13 }}>
                {LEADERBOARD_COPY.joinButton}
              </Text>
            </Pressable>
          </GlassCard>
        ) : null}

        {/* Your milestones — this device only */}
        <Text style={[styles.sectionTitle, headline, { marginTop: 20 }]}>{LEADERBOARD_COPY.yourMilestonesTitle}</Text>
        {milestones.length === 0 ? (
          <GlassCard style={styles.cardSpacing}>
            <Text style={[body, { fontSize: 13, textAlign: 'center' }]}>
              {LEADERBOARD_COPY.yourMilestonesEmpty}
            </Text>
          </GlassCard>
        ) : (
          milestones.map((m) => <MilestoneCard key={m.id} milestone={m} />)
        )}
      </ScrollView>
    </V3DetailShell>
  );
}

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  const t = useV3Theme();
  const counts = useReactionsStore((s) => s.counts(milestone.id));
  const toggle = useReactionsStore((s) => s.toggleReaction);
  const hasReacted = useReactionsStore((s) => s.hasReacted);
  const positive = t.colors.semanticPositive as string;

  return (
    <GlassCard style={styles.cardSpacing}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBubble, { backgroundColor: `${positive}2E` }]}>
          <Ionicons name={KIND_ICON[milestone.kind]} size={20} color={positive} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.headline,
              {
                color: t.colors.textPrimary as string,
                fontFamily: t.isDark
                  ? t.typography.headlineMale
                  : t.typography.headlineFemale,
              },
            ]}
          >
            {milestone.headline}
          </Text>
          {milestone.detail ? (
            <Text
              style={[
                styles.detail,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              {milestone.detail}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.reactionRow}>
        {REACTION_ORDER.map((kind) => {
          const reacted = hasReacted(milestone.id, kind);
          const count = counts[kind];
          return (
            <Pressable
              key={kind}
              onPress={() => {
                tapLight();
                toggle(milestone.id, kind);
              }}
              style={[
                styles.reactionChip,
                {
                  borderColor: reacted ? positive : (t.colors.cardBorder as string),
                  backgroundColor: reacted ? `${positive}26` : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: reacted }}
              accessibilityLabel={`${REACTION_LABELS[kind].label} ${milestone.headline}`}
            >
              <Text style={styles.reactionEmoji}>
                {REACTION_LABELS[kind].emoji}
              </Text>
              {count > 0 ? (
                <Text
                  style={{
                    color: t.colors.textPrimary as string,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 11,
                    marginLeft: 4,
                  }}
                >
                  {count}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16 },
  small: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  joinPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { fontSize: 16 },
  detail: { fontSize: 12, marginTop: 2 },
  reactionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  reactionEmoji: { fontSize: 14 },
});
