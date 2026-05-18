/**
 * Community leaderboard — Master Refactor Plan v3.1 §12.1.
 *
 * Friendly-competition surface. Three categories:
 *   - Streaks
 *   - Adherence %
 *   - Body-comp deltas (milestone-only labels — raw numbers stay private)
 *
 * The user's own card is computed locally from their stores. Cross-user
 * ranking ships once the server aggregation lands; until then this
 * surface shows the user where they stand against their own history +
 * a sample target band so the leaderboard is informative on day one.
 *
 * Gated by useCommunityPrefsStore.publicTracking — when off, the screen
 * surfaces an opt-in CTA instead of the leaderboard rows.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard, Chip } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight } from '../../src/utils/haptics';
import { useCommunityPrefsStore } from '../../src/store/useCommunityPrefsStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useBodyCompositionStore } from '../../src/store/useBodyCompositionStore';

type Category = 'streak' | 'adherence' | 'body_comp';

const CATEGORIES: { key: Category; label: string; sharePref: keyof ReturnType<typeof useCommunityPrefsStore.getState>['shareCategories'] }[] = [
  { key: 'streak', label: 'Streaks', sharePref: 'streak' },
  { key: 'adherence', label: 'Adherence', sharePref: 'adherence' },
  { key: 'body_comp', label: 'Body comp', sharePref: 'bodyCompDeltas' },
];

export default function LeaderboardScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const publicTracking = useCommunityPrefsStore((s) => s.publicTracking);
  const shareCategories = useCommunityPrefsStore((s) => s.shareCategories);

  const [category, setCategory] = useState<Category>('streak');

  const workoutStreak = useWorkoutStore((s) => s.getStreak());
  const doseStreak = useDoseStreak();
  const adherence = useDoseAdherence(14);
  // 2026-05-18 P0 fix: deltaWindow(90) returns a fresh
  // { weightLbDelta, bodyFatDelta, leanMassDelta } literal on every
  // call, so calling it inside the selector breaks Object.is and
  // loops the component infinitely (same bug class as DosesHub +
  // HomeScreen). Pull the accessor + scans ref, compute in useMemo.
  const scans = useBodyCompositionStore((s) => s.scans);
  const deltaWindow = useBodyCompositionStore((s) => s.deltaWindow);
  const bodyCompDelta = useMemo(
    () => deltaWindow(90),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deltaWindow, scans],
  );

  const myStat = useMemo(() => {
    if (category === 'streak') {
      return {
        value: `${Math.max(workoutStreak, doseStreak)} days`,
        label: 'Best streak this month',
      };
    }
    if (category === 'adherence') {
      return {
        value: `${Math.round(adherence * 100)}%`,
        label: '14-day dose adherence',
      };
    }
    const delta = bodyCompDelta.leanMassDelta ?? bodyCompDelta.weightLbDelta;
    return {
      value:
        delta != null
          ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} lb`
          : '—',
      label: '90-day lean / weight delta',
    };
  }, [category, workoutStreak, doseStreak, adherence, bodyCompDelta]);

  const currentPref = CATEGORIES.find((c) => c.key === category)!.sharePref;
  const sharingThisCategory =
    publicTracking && shareCategories[currentPref];

  return (
    <V3DetailShell
      title="Leaderboard"
      observation={
        publicTracking
          ? `You are sharing ${
              Object.values(shareCategories).filter(Boolean).length
            } categor${
              Object.values(shareCategories).filter(Boolean).length === 1
                ? 'y'
                : 'ies'
            }.`
          : 'Public sharing is off. Opt in to participate.'
      }
      intent="open_chat"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Category tabs */}
        <View style={styles.tabRow}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              primary={category === c.key}
              onPress={() => {
                tapLight();
                setCategory(c.key);
              }}
            />
          ))}
        </View>

        {/* Opt-in gate or stats card */}
        {!publicTracking ? (
          <Pressable
            onPress={() => {
              tapLight();
              router.push('/profile/community-prefs' as never);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open public sharing settings to opt in"
          >
            <GlassCard style={styles.cardSpacing}>
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
                Opt in to participate
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
                Public tracking is off. Turn it on in Profile to compare
                streaks, adherence, and body-comp deltas with the
                community. You can opt back out any time.
              </Text>
              <View style={styles.optInCta}>
                <Ionicons
                  name="arrow-forward"
                  size={14}
                  color={t.colors.textSecondary as string}
                />
                <Text
                  style={{
                    marginLeft: 6,
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 12,
                  }}
                >
                  Open sharing settings
                </Text>
              </View>
            </GlassCard>
          </Pressable>
        ) : !sharingThisCategory ? (
          <GlassCard style={styles.cardSpacing}>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              You are not sharing this category. Tap into Profile →
              Sharing to switch it on.
            </Text>
          </GlassCard>
        ) : (
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
              {myStat.label.toUpperCase()}
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
              {myStat.value}
            </Text>
            <Text
              style={[
                styles.statBand,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              {bandLabelFor(category, myStat.value)}
            </Text>
          </GlassCard>
        )}

        {/* Milestones drill-in — opted-in users can react / encourage
            (§12.1). Sits above the roster card so it's reachable even
            when the user is opted-in but the chosen leaderboard
            category isn't shared. */}
        <Pressable
          onPress={() => {
            tapLight();
            router.push('/community/milestones' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open your milestones to react and encourage"
        >
          <GlassCard style={styles.cardSpacing}>
            <View style={styles.rosterRow}>
              <Ionicons
                name="ribbon-outline"
                size={20}
                color={t.colors.textSecondary as string}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.rosterTitle,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.isDark
                        ? t.typography.headlineMale
                        : t.typography.headlineFemale,
                    },
                  ]}
                >
                  Your milestones
                </Text>
                <Text
                  style={[
                    styles.rosterBody,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  Streaks, cycles, PRs, lean-mass gains. Tap to react.
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

        {/* Community status — read-only roadmap copy until server
            aggregation lands. */}
        <GlassCard style={styles.cardSpacing}>
          <Text
            style={[
              styles.rosterTitle,
              {
                color: t.colors.textPrimary as string,
                fontFamily: t.isDark
                  ? t.typography.headlineMale
                  : t.typography.headlineFemale,
              },
            ]}
          >
            Community roster
          </Text>
          <Text
            style={[
              styles.rosterBody,
              {
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
              },
            ]}
          >
            Cross-user ranking is rolling out in waves. Your opt-in is
            recorded — as soon as your cohort has enough opted-in peers
            to ensure privacy on the rankings, your row appears here.
          </Text>
        </GlassCard>
      </ScrollView>
    </V3DetailShell>
  );
}

function useDoseStreak(): number {
  return useDoseLogStore((s) => {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const has = s.doses.some((x) => x.date === key);
      if (has) streak++;
      else if (i > 0) break;
    }
    return streak;
  });
}

function useDoseAdherence(days: number): number {
  return useDoseLogStore((s) => {
    const activeProtos = s.protocols.filter((p) => p.isActive);
    if (activeProtos.length === 0) return 0;
    let plannedDays = 0;
    let actualDoses = 0;
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      plannedDays++;
      if (s.doses.some((x) => x.date === key)) actualDoses++;
    }
    return plannedDays === 0 ? 0 : Math.min(1, actualDoses / plannedDays);
  });
}

function bandLabelFor(category: Category, value: string): string {
  if (category === 'streak') {
    const days = parseInt(value, 10);
    if (days >= 30) return 'Top band — 30+ days.';
    if (days >= 14) return 'Strong — 2 weeks plus.';
    if (days >= 7) return 'Solid — a week in.';
    return 'Building.';
  }
  if (category === 'adherence') {
    const pct = parseInt(value, 10);
    if (pct >= 90) return 'Top band — 90%+.';
    if (pct >= 75) return 'Strong — three-quarter hit rate.';
    if (pct >= 50) return 'Mid — room to push.';
    return 'Below 50% — reminders help.';
  }
  return 'Trend tracked privately. Milestones shared.';
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    marginBottom: 6,
  },
  optInTitle: {
    fontSize: 18,
  },
  optInBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
  },
  optInCta: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    letterSpacing: 1.4,
  },
  statValue: {
    fontSize: 38,
    marginTop: 6,
  },
  statBand: {
    fontSize: 12,
    marginTop: 6,
  },
  rosterTitle: {
    fontSize: 16,
  },
  rosterBody: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
