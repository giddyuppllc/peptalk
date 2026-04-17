import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../../src/components/GlassCard';
import { HOW_TO_GUIDES } from '../../../src/data/howToGuides';
import { GuideCategory } from '../../../src/types';

// ── Constants ────────────────────────────────────────────────────

type FilterOption = 'all' | GuideCategory;

const FILTER_OPTIONS: { key: FilterOption; label: string }[] = [
  { key: 'all',            label: 'All' },
  { key: 'reconstitution', label: 'Reconstitution' },
  { key: 'injection',      label: 'Injection' },
  { key: 'storage',        label: 'Storage' },
  { key: 'dosing',         label: 'Dosing' },
  { key: 'testing',        label: 'Testing' },
  { key: 'general',        label: 'General' },
];

function getCategoryColor(category: GuideCategory): string {
  switch (category) {
    case 'reconstitution': return '#b9cbb6';
    case 'injection':      return '#e3a7a1';
    case 'storage':        return '#c7d7e6';
    case 'dosing':         return '#f0d68a';
    case 'testing':        return '#F4E9A7';
    case 'general':        return '#6B7280';
    default:               return '#6B7280';
  }
}

// ── Component ────────────────────────────────────────────────────

export default function AllGuidesScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');

  const filteredGuides = useMemo(() => {
    if (activeFilter === 'all') return HOW_TO_GUIDES;
    return HOW_TO_GUIDES.filter((g) => g.category === activeFilter);
  }, [activeFilter]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#2D2D2D" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>How-To Guides</Text>
            <Text style={styles.headerSubtitle}>
              Step-by-step guides for reconstitution, injection, storage, and more.
            </Text>
          </View>
        </View>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {FILTER_OPTIONS.map((opt) => {
            const isActive = activeFilter === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.filterChip,
                  isActive && styles.filterChipActive,
                ]}
                onPress={() => setActiveFilter(opt.key)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isActive && styles.filterChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Guide Cards — 2-column grid */}
        {filteredGuides.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Ionicons name="list-outline" size={32} color="#6B7280" />
            <Text style={styles.emptyText}>
              No guides found for this category.
            </Text>
          </GlassCard>
        ) : (
          <View style={styles.gridContainer}>
            {filteredGuides.map((guide) => {
              const color = getCategoryColor(guide.category);
              return (
                <TouchableOpacity
                  key={guide.id}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/learn/guides/${guide.slug}`)}
                  style={styles.gridItem}
                >
                  <GlassCard style={styles.guideCard}>
                    <View
                      style={[
                        styles.categoryBadge,
                        { backgroundColor: `${color}20` },
                      ]}
                    >
                      <Text style={[styles.categoryBadgeText, { color }]}>
                        {guide.category}
                      </Text>
                    </View>

                    <Text style={styles.guideTitle} numberOfLines={2}>
                      {guide.title}
                    </Text>
                    <Text style={styles.guideSummary} numberOfLines={3}>
                      {guide.summary}
                    </Text>

                    <View style={styles.guideFooter}>
                      <View style={styles.stepCountBadge}>
                        <Ionicons name="footsteps-outline" size={12} color="#6B7280" />
                        <Text style={styles.stepCountText}>
                          {guide.steps.length} steps
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={color} />
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDE6D6',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // ── Header ─────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2D2D2D',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
  },

  // ── Filter Chips ───────────────────────────────────────────
  filterScroll: {
    marginVertical: 16,
    marginHorizontal: -20,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(227, 167, 161, 0.2)',
    borderColor: 'rgba(227, 167, 161, 0.4)',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#e3a7a1',
  },

  // ── Guide Grid ─────────────────────────────────────────────
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridItem: {
    width: '47.5%' as any,
  },
  guideCard: {
    minHeight: 170,
  },
  categoryBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  stepCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  guideTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 6,
    lineHeight: 20,
  },
  guideSummary: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    flex: 1,
  },
  guideFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },

  // ── Empty State ────────────────────────────────────────────
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
});
