/**
 * Resources & References — single dedicated page where users can verify
 * the sources backing every peptide claim in the app.
 *
 * Filters: by peptide (deep-link via ?peptide={id}), by topic, by source
 * type. Search hits title, authors, and journal. The freshness pill
 * (lastReviewed >18mo = amber) is visible at the entry level so users
 * know if a citation is stale.
 *
 * Reachable from Profile and (via "Sources" subtitle link) any peptide
 * detail page.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../src/components/GlassCard';
import { useTheme } from '../src/hooks/useTheme';
import { Spacing, FontSizes } from '../src/constants/theme';
import { SOURCES } from '../src/data/sources';
import {
  Source,
  SourceType,
  SOURCE_TYPE_LABELS,
} from '../src/types/sources';
import { getPeptideById } from '../src/data/peptides';

const FRESH_AMBER_DAYS = 18 * 30; // ~18 months

function isStale(lastReviewed: string): boolean {
  const ms = Date.now() - new Date(lastReviewed + 'T12:00:00Z').getTime();
  return ms / (24 * 3600 * 1000) > FRESH_AMBER_DAYS;
}

function formatAuthors(authors: string[] | undefined): string {
  if (!authors || authors.length === 0) return '';
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors[0]} et al.`;
}

const TYPE_FILTERS: { value: SourceType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'peer_reviewed', label: 'Peer-reviewed' },
  { value: 'clinical_trial', label: 'Trials' },
  { value: 'review_article', label: 'Reviews' },
  { value: 'regulatory', label: 'Regulatory' },
];

export default function ResourcesScreen() {
  const t = useTheme();
  const router = useRouter();
  const { peptide: peptideFilter } = useLocalSearchParams<{ peptide?: string }>();

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<SourceType | 'all'>('all');

  const filteredPeptide = peptideFilter
    ? getPeptideById(peptideFilter)
    : undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SOURCES.filter((s) => {
      if (typeFilter !== 'all' && s.type !== typeFilter) return false;
      if (peptideFilter && !s.peptideIds?.includes(peptideFilter)) return false;
      if (q) {
        const hay = `${s.title} ${s.authors?.join(' ') ?? ''} ${s.journal ?? ''} ${s.pubmedId ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.year - a.year);
  }, [query, typeFilter, peptideFilter]);

  const openSource = async (s: Source) => {
    const url = s.url ?? (s.doi ? `https://doi.org/${s.doi}` : null);
    if (!url) {
      Alert.alert(
        s.title,
        s.pubmedId
          ? `Reference: ${s.pubmedId}\n\nNo direct link available.`
          : 'No external link available for this source.',
      );
      return;
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert('Unable to open link', url);
  };

  const renderItem = ({ item }: { item: Source }) => {
    const stale = isStale(item.lastReviewed);
    return (
      <GlassCard style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, { backgroundColor: t.primary + '22' }]}>
            <Text style={[styles.typeBadgeText, { color: t.primary }]}>
              {SOURCE_TYPE_LABELS[item.type]}
            </Text>
          </View>
          <Text style={[styles.year, { color: t.textSecondary }]}>{item.year}</Text>
          {stale && (
            <View style={styles.staleDot} accessibilityLabel="Citation needs re-review" />
          )}
        </View>

        <Text style={[styles.title, { color: t.text }]} numberOfLines={3}>
          {item.title}
        </Text>

        {(item.authors || item.journal) && (
          <Text style={[styles.byline, { color: t.textSecondary }]} numberOfLines={2}>
            {formatAuthors(item.authors)}
            {item.authors && item.journal ? ' · ' : ''}
            {item.journal ? <Text style={{ fontStyle: 'italic' }}>{item.journal}</Text> : null}
          </Text>
        )}

        {item.quote && (
          <Text style={[styles.quote, { color: t.textSecondary, borderLeftColor: t.primary }]}>
            "{item.quote}"
          </Text>
        )}

        <View style={styles.metaRow}>
          {item.pubmedId && (
            <Text style={[styles.metaText, { color: t.textSecondary }]}>{item.pubmedId}</Text>
          )}
          {item.trialId && (
            <Text style={[styles.metaText, { color: t.textSecondary }]}>{item.trialId}</Text>
          )}
          <View style={{ flex: 1 }} />
          <Text style={[styles.lastReviewed, { color: stale ? '#B45309' : t.textSecondary }]}>
            verified {item.lastReviewed}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.viewBtn, { borderColor: t.cardBorder }]}
          onPress={() => openSource(item)}
          accessibilityRole="button"
          accessibilityLabel="View source"
        >
          <Text style={[styles.viewBtnText, { color: t.text }]}>View source</Text>
          <Ionicons name="open-outline" size={14} color={t.text} />
        </TouchableOpacity>
      </GlassCard>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Resources</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.intro}>
        <Text style={[styles.introTitle, { color: t.text }]}>References</Text>
        <Text style={[styles.introBody, { color: t.textSecondary }]}>
          {filteredPeptide
            ? `Sources backing claims about ${filteredPeptide.name}.`
            : 'Every peptide claim in PepTalk traces back to one of these sources. Tap to view.'}
        </Text>
        {filteredPeptide && (
          <TouchableOpacity
            style={styles.clearFilter}
            onPress={() => router.setParams({ peptide: '' })}
          >
            <Ionicons name="close-circle" size={14} color={t.textSecondary} />
            <Text style={[styles.clearFilterText, { color: t.textSecondary }]}>
              Show all sources
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.searchWrap, { borderColor: t.cardBorder }]}>
        <Ionicons name="search-outline" size={16} color={t.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: t.text }]}
          placeholder="Search title, author, journal..."
          placeholderTextColor={t.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color={t.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        horizontal
        data={TYPE_FILTERS}
        keyExtractor={(item) => item.value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const active = typeFilter === item.value;
          return (
            <TouchableOpacity
              onPress={() => setTypeFilter(item.value)}
              style={[
                styles.filterChip,
                { borderColor: t.cardBorder },
                active && { backgroundColor: t.primary, borderColor: t.primary },
              ]}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: active ? '#fff' : t.text },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={36} color={t.textSecondary} />
            <Text style={[styles.emptyText, { color: t.textSecondary }]}>
              No sources match these filters yet.
            </Text>
          </View>
        }
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
  intro: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  introTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  introBody: { fontSize: FontSizes.sm, lineHeight: 18 },
  clearFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  clearFilterText: { fontSize: FontSizes.xs, fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 12,
  },
  searchInput: { flex: 1, fontSize: FontSizes.sm, paddingVertical: 0 },
  filterRow: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipText: { fontSize: FontSizes.xs, fontWeight: '600' },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 40, gap: Spacing.sm },
  card: { padding: Spacing.md },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  year: { fontSize: FontSizes.xs, fontWeight: '600' },
  staleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#B45309',
    marginLeft: 'auto',
  },
  title: { fontSize: FontSizes.md, fontWeight: '700', lineHeight: 20, marginBottom: 4 },
  byline: { fontSize: FontSizes.xs, marginBottom: 8 },
  quote: {
    fontSize: FontSizes.xs,
    lineHeight: 18,
    fontStyle: 'italic',
    paddingLeft: 10,
    borderLeftWidth: 2,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  metaText: { fontSize: 11, fontWeight: '600' },
  lastReviewed: { fontSize: 10 },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewBtnText: { fontSize: FontSizes.xs, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: FontSizes.sm },
});
