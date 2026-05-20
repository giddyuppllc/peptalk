/**
 * Milestones — Master Refactor Plan v3.1 §12.1.
 *
 * Surfaces achievements computed from local data (dose streaks, workout
 * streaks, completed cycles, PRs, lean-mass gains, lab improvements)
 * with tap-to-react chips. Cross-user reaction fan-out lands with the
 * server aggregation; for now the user can react to their own
 * milestones — self-encouragement is a documented adherence lever and
 * the local counts roll forward when peer reactions merge in.
 */

import React, { useMemo } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight } from '../../src/utils/haptics';
import { computeMilestones, type Milestone } from '../../src/services/milestones';
import {
  useReactionsStore,
  REACTION_LABELS,
  type ReactionKind,
} from '../../src/store/useReactionsStore';
import { useCommunityPrefsStore } from '../../src/store/useCommunityPrefsStore';

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
  const publicTracking = useCommunityPrefsStore((s) => s.publicTracking);
  const sharesMilestones = useCommunityPrefsStore(
    (s) => s.shareCategories.milestones,
  );

  const observation =
    milestones.length === 0
      ? 'No milestones yet. Log doses, train, take scans — they show up here.'
      : publicTracking && sharesMilestones
        ? `${milestones.length} milestone${milestones.length === 1 ? '' : 's'}. Shared with the community.`
        : `${milestones.length} milestone${milestones.length === 1 ? '' : 's'}. Private — Profile → Sharing to opt in.`;

  return (
    <V3DetailShell
      title="Milestones"
      observation={observation}
      intent="open_chat"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {!publicTracking || !sharesMilestones ? (
          <Pressable
            onPress={() => {
              tapLight();
              router.push('/profile/community-prefs' as never);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open public sharing settings"
          >
            <GlassCard style={styles.cardSpacing}>
              <View style={styles.optInRow}>
                <Ionicons
                  name="people-circle-outline"
                  size={18}
                  color={t.colors.textSecondary as string}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.optInTitle,
                      {
                        color: t.colors.textPrimary as string,
                        fontFamily: t.isDark
                          ? t.typography.headlineMale
                          : t.typography.headlineFemale,
                      },
                    ]}
                  >
                    Share milestones with the community
                  </Text>
                  <Text
                    style={[
                      styles.optInBody,
                      {
                        color: t.colors.textSecondary as string,
                        fontFamily: t.typography.body,
                      },
                    ]}
                  >
                    You can still react to your own below — server fan-out
                    rolls out with the leaderboard.
                  </Text>
                </View>
              </View>
            </GlassCard>
          </Pressable>
        ) : null}

        {milestones.length === 0 ? (
          <GlassCard style={styles.cardSpacing}>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              No milestones detected from your data yet.
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

  return (
    <GlassCard style={styles.cardSpacing}>
      <View style={styles.headerRow}>
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
            name={KIND_ICON[milestone.kind]}
            size={20}
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
                  borderColor: reacted
                    ? t.isDark
                      ? ((t.colors as any).accentCognac as string)
                      : ((t.colors as any).accentRose as string)
                    : (t.colors.cardBorder as string),
                  backgroundColor: reacted
                    ? t.isDark
                      ? 'rgba(201,136,90,0.15)'
                      : 'rgba(229,146,141,0.18)'
                    : 'transparent',
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
  optInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optInTitle: { fontSize: 15 },
  optInBody: { fontSize: 12, marginTop: 4, lineHeight: 17 },
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
