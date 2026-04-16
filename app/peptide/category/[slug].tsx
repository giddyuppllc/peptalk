/**
 * Category Peptide List — shows all peptides in a single category.
 * Purely educational framing; no prescriptive language.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/hooks/useTheme';
import { Spacing } from '../../../src/constants/theme';
import { PEPTIDES } from '../../../src/data/peptides';
import type { PeptideCategory } from '../../../src/types';

export default function CategoryPeptideList() {
  const t = useTheme();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const category = (slug ?? '') as PeptideCategory;

  const peptides = useMemo(
    () => PEPTIDES.filter((p) => p.categories.includes(category)),
    [category],
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]} numberOfLines={1}>
          {category || 'Category'}
        </Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        contentContainerStyle={s.scroll}
      >
        {/* Editorial subtitle */}
        <View style={s.subtitleWrap}>
          <Text style={[s.count, { color: t.primary }]}>
            {peptides.length} compound{peptides.length !== 1 ? 's' : ''}
          </Text>
          <Text style={[s.subtitle, { color: t.textSecondary }]}>
            Research reference for peptides in this category
          </Text>
        </View>

        {/* Disclaimer chip */}
        <View style={[s.disclaimerChip, { backgroundColor: `${t.primary}10`, borderColor: `${t.primary}30` }]}>
          <Ionicons name="shield-checkmark-outline" size={14} color={t.primary} />
          <Text style={[s.disclaimerText, { color: t.textSecondary }]}>
            Educational information only. Not medical advice.
          </Text>
        </View>

        {/* Peptide list */}
        {peptides.length === 0 ? (
          <View style={[s.emptyState, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
            <Ionicons name="flask-outline" size={32} color={t.textSecondary} />
            <Text style={[s.emptyTitle, { color: t.text }]}>No peptides in this category</Text>
            <Text style={[s.emptyDesc, { color: t.textSecondary }]}>
              Check back as the research library grows
            </Text>
          </View>
        ) : (
          peptides.map((peptide) => {
            const snippet = peptide.researchSummary.split('.')[0] + '.';
            return (
              <TouchableOpacity
                key={peptide.id}
                style={[s.peptideCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
                onPress={() => router.push(`/peptide/${peptide.id}` as any)}
                activeOpacity={0.85}
              >
                <View style={[s.peptideIcon, { backgroundColor: `${t.primary}18` }]}>
                  <Ionicons name="flask" size={18} color={t.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.peptideHeader}>
                    <Text style={[s.peptideName, { color: t.text }]} numberOfLines={1}>
                      {peptide.name}
                    </Text>
                    {peptide.evidenceGrade === 'established' && (
                      <View style={[s.gradeBadge, { backgroundColor: `${t.primary}20` }]}>
                        <Text style={[s.gradeBadgeText, { color: t.primary }]}>ESTABLISHED</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.peptideSnippet, { color: t.textSecondary }]} numberOfLines={2}>
                    {snippet}
                  </Text>
                  <View style={s.peptideFooter}>
                    <Text style={[s.peptideLearnMore, { color: t.primary }]}>Learn more</Text>
                    <Ionicons name="arrow-forward" size={12} color={t.primary} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 8,
  },
  subtitleWrap: {
    marginBottom: 14,
  },
  count: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  disclaimerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 18,
  },
  disclaimerText: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    flex: 1,
  },
  peptideCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  peptideIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peptideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  peptideName: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    flexShrink: 1,
  },
  gradeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  gradeBadgeText: {
    fontSize: 8,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.4,
  },
  peptideSnippet: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    lineHeight: 17,
    marginBottom: 6,
  },
  peptideFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  peptideLearnMore: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'DMSans-Bold',
    marginTop: 6,
  },
  emptyDesc: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
  },
});
