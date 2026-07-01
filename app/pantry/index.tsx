/**
 * My Pantry — lists everything the user has in their kitchen,
 * grouped by storage location (fridge / freezer / pantry), sorted
 * by expiry date ascending so items nearing expiry surface first.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { usePantryStore, type PantryItem, type StorageLocation } from '../../src/store/usePantryStore';

type ExpiryColorKey = 'danger' | 'caution' | 'positive' | 'muted';

const LOCATION_LABELS: Record<StorageLocation, string> = {
  fridge:  'Fridge',
  freezer: 'Freezer',
  pantry:  'Pantry',
};

const LOCATION_ICONS: Record<StorageLocation, keyof typeof Ionicons.glyphMap> = {
  fridge:  'snow-outline',
  freezer: 'snow',
  pantry:  'file-tray-outline',
};

function daysUntil(date?: string): number | null {
  if (!date) return null;
  const target = new Date(date);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function expiryLabel(date?: string): { label: string; key: ExpiryColorKey } | null {
  const d = daysUntil(date);
  if (d === null) return null;
  if (d < 0)  return { label: `Expired ${Math.abs(d)}d ago`, key: 'danger' };
  if (d === 0) return { label: 'Expires today',               key: 'danger' };
  if (d === 1) return { label: 'Expires tomorrow',            key: 'caution' };
  if (d <= 3)  return { label: `${d}d left`,                  key: 'caution' };
  if (d <= 7)  return { label: `${d}d left`,                  key: 'positive' };
  return { label: `${d}d left`, key: 'muted' };
}

function resolveExpiryColor(key: ExpiryColorKey, v3: ReturnType<typeof useV3Theme>): string {
  const c = v3.colors as any;
  if (key === 'danger') return c.semanticDanger ?? '#B91C1C';
  if (key === 'caution') return c.semanticCaution ?? '#B45309';
  if (key === 'positive') return c.semanticPositive ?? '#15803D';
  return c.textSecondary ?? '#6B7280';
}

export default function PantryScreen() {
  const router = useRouter();
  const t = useTheme();
  const v3 = useV3Theme();
  const items = usePantryStore((s) => s.items);
  const removeItem = usePantryStore((s) => s.removeItem);
  const clearAll = usePantryStore((s) => s.clearAll);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.brand ?? '').toLowerCase().includes(q),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const groups: Record<StorageLocation, PantryItem[]> = {
      fridge:  [],
      freezer: [],
      pantry:  [],
    };
    for (const item of filtered) {
      groups[item.storageLocation].push(item);
    }
    // Sort each group by expiry date ascending (items without date go last)
    for (const loc of Object.keys(groups) as StorageLocation[]) {
      groups[loc].sort((a, b) => {
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
      });
    }
    return groups;
  }, [filtered]);

  const confirmRemove = (item: PantryItem) => {
    Alert.alert('Remove item', `Remove ${item.name} from your pantry?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeItem(item.id) },
    ]);
  };

  const confirmClearAll = () => {
    Alert.alert(
      'Clear pantry',
      `Remove all ${items.length} item${items.length === 1 ? '' : 's'} from your pantry? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear all', style: 'destructive', onPress: () => clearAll() },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>My Pantry</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {items.length > 0 ? (
            <TouchableOpacity
              onPress={confirmClearAll}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear all pantry items"
            >
              <Ionicons name="trash-outline" size={22} color={t.text} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => router.push('/pantry/scan' as any)}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Scan kitchen with camera to add more"
          >
            <Ionicons name="scan" size={24} color={t.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/pantry/add' as any)}
            style={styles.iconBtn}
          >
            <Ionicons name="add-circle" size={28} color={t.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: t.inputBg }]}>
          <Ionicons name="search" size={18} color={t.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: t.text }]}
            placeholder="Search your pantry…"
            placeholderTextColor={t.placeholder}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={t.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {items.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.aiSuggestBanner, { borderColor: t.primary }]}
              onPress={() => router.push('/nutrition/pantry-suggestions' as any)}
              activeOpacity={0.85}
            >
              <View style={[styles.aiSuggestIcon, { backgroundColor: t.primary }]}>
                <Ionicons name="sparkles" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.aiSuggestTitle, { color: t.text }]}>
                  What should I cook tonight?
                </Text>
                <Text style={[styles.aiSuggestBody, { color: t.textSecondary }]}>
                  Smart meal ideas from what you have — Pro
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={t.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {items.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="basket-outline" size={32} color={t.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: t.text }]}>Your pantry is empty</Text>
            <Text style={[styles.emptyBody, { color: t.textSecondary }]}>
              Add what's in your kitchen so you can build meals from what you actually have — and get alerts before anything goes bad.
            </Text>
            <TouchableOpacity
              style={[styles.emptyCTA, { backgroundColor: t.primary }]}
              onPress={() => router.push('/pantry/add' as any)}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.emptyCTAText}>Add an item</Text>
            </TouchableOpacity>
          </View>
        )}

        {(['fridge', 'freezer', 'pantry'] as const).map((loc) => {
          const groupItems = grouped[loc];
          if (groupItems.length === 0) return null;
          return (
            <View key={loc} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name={LOCATION_ICONS[loc]} size={18} color={t.textSecondary} />
                <Text style={[styles.sectionTitle, { color: t.text }]}>
                  {LOCATION_LABELS[loc]}
                </Text>
                <Text style={[styles.sectionCount, { color: t.textSecondary }]}>
                  {groupItems.length}
                </Text>
              </View>

              {groupItems.map((item) => {
                const exp = expiryLabel(item.expiryDate);
                const expColor = exp ? resolveExpiryColor(exp.key, v3) : undefined;
                return (
                  <GlassCard key={item.id} style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemName, { color: t.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.brand && (
                          <Text style={[styles.itemBrand, { color: t.textSecondary }]}>
                            {item.brand}
                          </Text>
                        )}
                        <Text style={[styles.itemQty, { color: t.textSecondary }]}>
                          {item.quantity} {item.unit}
                        </Text>
                        {exp && expColor && (
                          <View style={[styles.expiryPill, { borderColor: expColor }]}>
                            <View style={[styles.expiryDot, { backgroundColor: expColor }]} />
                            <Text style={[styles.expiryText, { color: expColor }]}>
                              {exp.label}
                            </Text>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => confirmRemove(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={
                            ((v3.colors as any).semanticDanger as string) ?? Colors.error
                          }
                        />
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
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
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  searchWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: BorderRadius.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
  },
  emptyState: {
    paddingTop: 48,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,179,194,0.12)',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
  },
  emptyCTAText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    flex: 1,
  },
  sectionCount: {
    fontSize: FontSizes.sm,
  },
  itemCard: {
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemName: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  itemBrand: {
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  itemQty: {
    fontSize: FontSizes.sm,
    marginTop: 4,
  },
  expiryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  expiryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  expiryText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  aiSuggestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    backgroundColor: 'rgba(127,179,194,0.06)',
  },
  aiSuggestIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSuggestTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    marginBottom: 2,
  },
  aiSuggestBody: {
    fontSize: FontSizes.xs,
  },
});
