/**
 * LeaderboardStrip — the top check-in streaks, as a tappable strip.
 *
 * Real data only: rows come from get_community_leaderboard('checkin_streak')
 * via useLeaderboardStore, which returns opted-in users and nobody else. The
 * hardcoded sample roster this component shipped with is gone. When the board
 * is empty, or has not loaded, the strip renders as a plain entry row into the
 * leaderboard rather than inventing people to fill it.
 *
 * Mounted at the top of the community feed. Tapping anywhere opens
 * /community/leaderboard.
 */

import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useLeaderboardStore } from '../store/useLeaderboardStore';
import { LEADERBOARD_COPY, METRIC_COPY, formatMetricValue } from '../constants/leaderboardCopy';
import { leaderboardName } from './community/LeaderboardParts';

const STRIP_METRIC = 'checkin_streak' as const;
const STRIP_MAX = 12;

function initials(name: string): string {
  return name
    .replace(/^@/, '')
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function LeaderboardStripImpl() {
  const t = useTheme();
  const router = useRouter();
  const board = useLeaderboardStore((s) => s.boards[STRIP_METRIC]);
  const loadBoard = useLeaderboardStore((s) => s.loadBoard);

  useEffect(() => {
    void loadBoard(STRIP_METRIC);
  }, [loadBoard]);

  const open = () => router.push('/community/leaderboard' as never);
  const rows = board.rows.slice(0, STRIP_MAX);

  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={LEADERBOARD_COPY.feedEntryA11y}
      style={[styles.container, { backgroundColor: t.card, borderColor: t.cardBorder }]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="trophy-outline" size={13} color={t.textSecondary} />
          <Text style={[styles.headerTitle, { color: t.text }]} numberOfLines={1}>
            {LEADERBOARD_COPY.stripTitle}
          </Text>
        </View>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerSub, { color: t.textSecondary }]} numberOfLines={1}>
            {rows.length > 0 ? METRIC_COPY[STRIP_METRIC].label : LEADERBOARD_COPY.stripEmpty}
          </Text>
          <Ionicons name="chevron-forward" size={13} color={t.textSecondary} />
        </View>
      </View>

      {rows.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripContent}
          decelerationRate="fast"
        >
          {rows.map((row) => {
            const name = leaderboardName(row);
            return (
              <View key={row.userId} style={styles.avatarCol}>
                <View
                  style={[
                    styles.avatarRing,
                    { borderColor: row.isSelf ? t.text : t.cardBorder },
                  ]}
                >
                  {row.avatarUrl ? (
                    <Image source={{ uri: row.avatarUrl }} style={styles.avatarImg} cachePolicy="memory-disk" transition={150} />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: `${t.textMuted}18` }]}>
                      <Text style={[styles.avatarInitials, { color: t.textSecondary }]}>{initials(name)}</Text>
                    </View>
                  )}
                  <View style={[styles.rankBadge, { backgroundColor: t.text }]}>
                    <Text style={[styles.rankBadgeText, { color: t.card }]}>{row.rank}</Text>
                  </View>
                </View>
                <Text style={[styles.valueText, { color: row.isSelf ? t.text : t.textSecondary }]} numberOfLines={1}>
                  {formatMetricValue(STRIP_METRIC, row.value)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
    </TouchableOpacity>
  );
}

const AVATAR_SIZE = 38;

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
  },
  headerSub: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
  },
  stripContent: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 6,
  },
  avatarCol: {
    alignItems: 'center',
    width: 56,
  },
  avatarRing: {
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: (AVATAR_SIZE + 4) / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
  },
  rankBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: 9,
    fontFamily: 'DMSans-Bold',
  },
  valueText: {
    fontSize: 10,
    fontFamily: 'DMSans-SemiBold',
  },
});

// Memoized: the strip owns its own data and takes no props, so feed re-renders
// should not re-render it.
export const LeaderboardStrip = React.memo(LeaderboardStripImpl);
