/**
 * LeaderboardStrip — horizontal scrollable avatar strip showing top community members.
 *
 * Phase 1: Uses mock data + the current user's real XP.
 * Phase 2: Will fetch from Supabase leaderboard_profiles table.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useAchievementStore, getLevelForXP } from '../store/useAchievementStore';
import { useAuthStore } from '../store/useAuthStore';
import { LinearGradient } from 'expo-linear-gradient';

// ── Mock leaderboard data (Phase 1 — replaced by Supabase in Phase 2) ──

interface LeaderboardEntry {
  id: string;
  displayName: string;
  avatarUri?: string;
  weeklyXP: number;
  totalXP: number;
  streak: number;
  isCurrentUser?: boolean;
}

const MOCK_USERS: LeaderboardEntry[] = [
  { id: 'm1', displayName: 'Sarah K.', weeklyXP: 2340, totalXP: 8200, streak: 45 },
  { id: 'm2', displayName: 'Mike R.', weeklyXP: 1980, totalXP: 6800, streak: 32 },
  { id: 'm3', displayName: 'Jess L.', weeklyXP: 1450, totalXP: 5100, streak: 21 },
  { id: 'm4', displayName: 'Alex T.', weeklyXP: 1200, totalXP: 4300, streak: 18 },
  { id: 'm5', displayName: 'Dana M.', weeklyXP: 980, totalXP: 3600, streak: 14 },
  { id: 'm6', displayName: 'Chris P.', weeklyXP: 870, totalXP: 2900, streak: 11 },
  { id: 'm7', displayName: 'Riley W.', weeklyXP: 640, totalXP: 2100, streak: 8 },
  { id: 'm8', displayName: 'Jordan B.', weeklyXP: 520, totalXP: 1700, streak: 6 },
  { id: 'm9', displayName: 'Taylor H.', weeklyXP: 380, totalXP: 1200, streak: 4 },
  { id: 'm10', displayName: 'Casey N.', weeklyXP: 210, totalXP: 800, streak: 2 },
];

const RANK_RING_COLORS: Record<number, [string, string]> = {
  0: ['#FFD700', '#FFA500'], // Gold
  1: ['#C0C0C0', '#A0A0A0'], // Silver
  2: ['#CD7F32', '#A0522D'], // Bronze
};

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function LeaderboardStrip() {
  const t = useTheme();
  const xp = useAchievementStore((s) => s.xp);
  const user = useAuthStore((s) => s.user);

  const entries = useMemo(() => {
    // Insert current user into mock data
    const currentUser: LeaderboardEntry = {
      id: 'me',
      displayName: user?.firstName ? `${user.firstName} ${(user?.lastName ?? '')[0] ?? ''}.`.trim() : 'You',
      avatarUri: user?.avatarUri,
      weeklyXP: Math.round(xp * 0.3), // Simulate weekly as 30% of total for Phase 1
      totalXP: xp,
      streak: 0,
      isCurrentUser: true,
    };

    const all = [...MOCK_USERS, currentUser];
    return all.sort((a, b) => b.weeklyXP - a.weeklyXP);
  }, [xp, user]);

  const myRank = entries.findIndex(e => e.isCurrentUser) + 1;
  const myEntry = entries.find(e => e.isCurrentUser);

  return (
    <View style={[styles.container, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      {/* Header + rank inline */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="trophy" size={13} color="#FFD700" />
          <Text style={[styles.headerTitle, { color: t.text }]}>Community</Text>
        </View>
        <Text style={[styles.rankInline, { color: t.textSecondary }]}>
          #{myRank} · <Text style={{ color: t.primary, fontFamily: 'DMSans-Bold' }}>{(myEntry?.weeklyXP ?? 0).toLocaleString()} XP</Text>
        </Text>
      </View>

      {/* Avatar strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripContent}
        decelerationRate="fast"
      >
        {entries.slice(0, 12).map((entry, idx) => {
          const rankColors = RANK_RING_COLORS[idx];
          const isMe = entry.isCurrentUser;

          return (
            <TouchableOpacity
              key={entry.id}
              style={styles.avatarCol}
              activeOpacity={0.7}
            >
              <View style={styles.avatarWrap}>
                {rankColors ? (
                  <LinearGradient
                    colors={rankColors}
                    style={styles.avatarRing}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <View style={[styles.avatarInner, { backgroundColor: t.card }]}>
                      {entry.avatarUri ? (
                        <Image source={{ uri: entry.avatarUri }} style={styles.avatarImg} />
                      ) : (
                        <View style={[styles.avatarFallback, { backgroundColor: isMe ? `${t.primary}25` : `${t.textMuted}15` }]}>
                          <Text style={[styles.avatarInitials, { color: isMe ? t.primary : t.textSecondary }]}>
                            {getInitials(entry.displayName)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={[styles.avatarRing, { backgroundColor: isMe ? `${t.primary}30` : `${t.textMuted}18` }]}>
                    <View style={[styles.avatarInner, { backgroundColor: t.card }]}>
                      {entry.avatarUri ? (
                        <Image source={{ uri: entry.avatarUri }} style={styles.avatarImg} />
                      ) : (
                        <View style={[styles.avatarFallback, { backgroundColor: isMe ? `${t.primary}25` : `${t.textMuted}12` }]}>
                          <Text style={[styles.avatarInitials, { color: isMe ? t.primary : t.textSecondary }]}>
                            {getInitials(entry.displayName)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {idx < 3 && (
                  <View style={[styles.rankBadge, { backgroundColor: rankColors ? rankColors[0] : '#ccc' }]}>
                    <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                  </View>
                )}

                {isMe && (
                  <View style={[styles.youBadge, { backgroundColor: t.primary }]}>
                    <Text style={styles.youBadgeText}>You</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.xpText, { color: isMe ? t.primary : t.textSecondary }]} numberOfLines={1}>
                {entry.weeklyXP.toLocaleString()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const AVATAR_SIZE = 38;
const RING_SIZE = AVATAR_SIZE + 5;

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
  },
  rankInline: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
  },
  stripContent: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 2,
  },
  avatarCol: {
    alignItems: 'center',
    width: 50,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 4,
  },
  avatarRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
  },
  rankBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  rankBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  youBadge: {
    position: 'absolute',
    bottom: -2,
    left: -4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  youBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  xpText: {
    fontSize: 10,
    fontFamily: 'DMSans-SemiBold',
  },
});
