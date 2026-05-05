/**
 * Blocked-users list — Settings entry that lets a user review + unblock.
 *
 * Required by App Store Guideline 1.2 — users must be able to manage
 * their block list, not just create blocks.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../src/constants/theme';
import { useCommunityStore } from '../../src/store/useCommunityStore';

export default function BlockedUsersScreen() {
  const t = useTheme();
  const router = useRouter();
  const blockedUserIds = useCommunityStore((s) => s.blockedUserIds);
  const hydrate = useCommunityStore((s) => s.hydrateBlockedUsers);
  const unblock = useCommunityStore((s) => s.unblockUser);

  const [profileMap, setProfileMap] = useState<Record<string, { username?: string; displayName?: string }>>({});

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Look up the blocked users' display names so the row isn't a UUID.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (blockedUserIds.length === 0) return;
      try {
        const { supabase } = await import('../../src/services/supabase');
        const { data } = await (supabase as any)
          .from('profiles')
          .select('id, username, display_name')
          .in('id', blockedUserIds);
        if (cancelled) return;
        const map: Record<string, { username?: string; displayName?: string }> = {};
        for (const r of data ?? []) {
          map[r.id] = {
            username: r.username ?? undefined,
            displayName: r.display_name ?? undefined,
          };
        }
        setProfileMap(map);
      } catch { /* silent */ }
    })();
    return () => {
      cancelled = true;
    };
  }, [blockedUserIds]);

  const handleUnblock = (userId: string) => {
    Alert.alert('Unblock?', 'You\'ll start seeing their content again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          const res = await unblock(userId);
          if (!res.ok) Alert.alert('Failed', res.error);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Blocked users</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={blockedUserIds}
        keyExtractor={(id) => id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="happy-outline" size={36} color={t.textSecondary} />
            <Text style={[styles.emptyText, { color: t.textSecondary }]}>
              You haven't blocked anyone.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const profile = profileMap[item];
          const name = profile?.displayName || profile?.username || 'Member';
          return (
            <GlassCard style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: t.primary + '22' }]}>
                <Ionicons name="person-outline" size={14} color={t.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>{name}</Text>
                {profile?.username && profile.username !== name && (
                  <Text style={[styles.handle, { color: t.textSecondary }]}>@{profile.username}</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => handleUnblock(item)}
                style={[styles.unblockBtn, { borderColor: t.cardBorder }]}
              >
                <Text style={[styles.unblockText, { color: t.text }]}>Unblock</Text>
              </TouchableOpacity>
            </GlassCard>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  list: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.md,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: FontSizes.sm, fontWeight: '700' },
  handle: { fontSize: 11, marginTop: 2 },
  unblockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  unblockText: { fontSize: FontSizes.xs, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: FontSizes.sm },
});
