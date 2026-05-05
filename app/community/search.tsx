/**
 * Community search — text query against post titles + bodies.
 *
 * Plain ILIKE for v1; FTS is a v1.5 swap once we have enough content.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../src/constants/theme';
import { useCommunityStore } from '../../src/store/useCommunityStore';
import { PostCard } from '../../src/components/community/PostCard';
import type { CommunityPost } from '../../src/types/community';

export default function CommunitySearchScreen() {
  const t = useTheme();
  const router = useRouter();
  const topics = useCommunityStore((s) => s.topics);
  const searchPosts = useCommunityStore((s) => s.searchPosts);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<CommunityPost[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      const r = await searchPosts(q.trim());
      setResults(r);
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [q, searchPosts]);

  const topicLabel = (slug: string) =>
    topics.find((tp) => tp.slug === slug)?.name ?? slug;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <View style={[styles.searchBox, { borderColor: t.cardBorder }]}>
          <Ionicons name="search-outline" size={16} color={t.textSecondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search posts"
            placeholderTextColor={t.textSecondary}
            autoFocus
            style={[styles.searchInput, { color: t.text }]}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={t.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={{ width: 8 }} />
      </View>

      {searching && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color={t.textSecondary} />
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          q.length >= 2 && !searching ? (
            <Text style={[styles.empty, { color: t.textSecondary }]}>
              No matches for "{q}".
            </Text>
          ) : (
            <Text style={[styles.empty, { color: t.textSecondary }]}>
              Search post titles and bodies.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            topicLabel={topicLabel(item.topicSlug)}
            onPress={() => router.push(`/community/${item.id}` as any)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 12,
  },
  searchInput: { flex: 1, fontSize: FontSizes.sm, paddingVertical: 4 },
  loadingBar: { paddingVertical: 6, alignItems: 'center' },
  list: { padding: Spacing.md, gap: Spacing.sm },
  empty: { padding: 30, textAlign: 'center', fontSize: FontSizes.sm },
});
