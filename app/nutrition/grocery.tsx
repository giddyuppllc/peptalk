/**
 * Grocery list — the store had full CRUD and no screen at all.
 *
 * useGroceryStore ships addItem / removeItem / toggleItem / clearChecked /
 * clearAll, `GroceryItem` and `GroceryCategory` are defined in types/fitness,
 * and the ONLY consumer anywhere in the app was the logout handler clearing it.
 * No screen, no route, no way to add an item or tick one off.
 *
 * Meanwhile the AI meal-plan card on the nutrition screen advertises "7-day
 * meals + grocery list, from your targets."
 *
 * Deliberately NOT generated from the meal plan. PlannedMeal carries a name,
 * a description and macros — no ingredient list — so building a shopping list
 * from it would mean parsing prose into groceries and guessing quantities.
 * That is invention, and inventing ingredients for someone's shopping is worse
 * than leaving the list manual. If the planner ever emits ingredients, this
 * screen already has `addedFrom` to attribute them.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Alert } from '../../src/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, BorderRadius, FontSizes } from '../../src/constants/theme';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { useGroceryStore } from '../../src/store/useGroceryStore';
import {
  GROCERY_CATEGORY_ORDER,
  GROCERY_CATEGORY_LABELS,
  groupGroceryItems,
  grocerySummary,
} from '../../src/lib/grocery';
import type { GroceryCategory } from '../../src/types/fitness';

export default function GroceryScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();

  const items = useGroceryStore((s) => s.items);
  const addItem = useGroceryStore((s) => s.addItem);
  const removeItem = useGroceryStore((s) => s.removeItem);
  const toggleItem = useGroceryStore((s) => s.toggleItem);
  const clearChecked = useGroceryStore((s) => s.clearChecked);

  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState<GroceryCategory>('produce');

  const groups = useMemo(() => groupGroceryItems(items), [items]);
  const summary = useMemo(() => grocerySummary(items), [items]);

  const handleAdd = () => {
    const name = draft.trim();
    if (!name) return;
    tapMedium();
    addItem(name, category);
    setDraft('');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: t.text }]}>Grocery list</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Add */}
        <GlassCard style={styles.card}>
          <View style={styles.addRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
              placeholder="Add an item…"
              placeholderTextColor={t.textMuted}
              style={[
                styles.input,
                { color: t.text, backgroundColor: t.surface, borderColor: t.cardBorder },
              ]}
              accessibilityLabel="Grocery item name"
            />
            <Pressable
              onPress={handleAdd}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Add item"
              style={[
                styles.addBtn,
                { backgroundColor: accent.deep, opacity: draft.trim() ? 1 : 0.4 },
              ]}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            <View style={styles.chipRow}>
              {GROCERY_CATEGORY_ORDER.map((c) => {
                const active = c === category;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      tapLight();
                      setCategory(c);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Category ${GROCERY_CATEGORY_LABELS[c]}`}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? accent.deep : t.cardBorder,
                        backgroundColor: active ? `${accent.deep}1A` : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[styles.chipText, { color: active ? accent.deep : t.textSecondary }]}
                    >
                      {GROCERY_CATEGORY_LABELS[c]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </GlassCard>

        {/* List */}
        {groups.length === 0 ? (
          <GlassCard style={styles.card}>
            <Text style={[styles.emptyBody, { color: t.textSecondary }]}>
              Nothing on the list yet. Add what you need above — it stays here
              until you clear it.
            </Text>
          </GlassCard>
        ) : (
          groups.map((group) => (
            <GlassCard key={group.category} style={styles.card}>
              <Text style={[styles.groupLabel, { color: t.text }]}>
                {group.label.toUpperCase()}
              </Text>
              {group.items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    tapLight();
                    toggleItem(item.id);
                  }}
                  onLongPress={() =>
                    Alert.alert('Remove item?', item.name, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => {
                          tapMedium();
                          removeItem(item.id);
                        },
                      },
                    ])
                  }
                  delayLongPress={450}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.checked }}
                  accessibilityLabel={`${item.name}. ${
                    item.checked ? 'In the basket' : 'Still needed'
                  }. Tap to toggle, long press to remove.`}
                  style={[styles.itemRow, { borderTopColor: t.cardBorder }]}
                >
                  <Ionicons
                    name={item.checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={item.checked ? '#10b981' : t.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.itemName,
                        {
                          color: item.checked ? t.textSecondary : t.text,
                          textDecorationLine: item.checked ? 'line-through' : 'none',
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                    {item.addedFrom ? (
                      <Text style={[styles.itemFrom, { color: t.textMuted }]}>
                        from {item.addedFrom}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </GlassCard>
          ))
        )}

        {summary.checked > 0 ? (
          <Pressable
            onPress={() => {
              tapMedium();
              clearChecked();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${summary.checked} checked items`}
            style={[styles.secondaryBtn, { borderColor: t.cardBorder }]}
          >
            <Ionicons name="trash-outline" size={16} color={t.textSecondary} />
            <Text style={[styles.secondaryBtnText, { color: t.textSecondary }]}>
              Clear {summary.checked} checked
            </Text>
          </Pressable>
        ) : null}

        {summary.total > 0 ? (
          <Text style={[styles.footer, { color: t.textMuted }]}>
            {summary.checked} of {summary.total} in the basket
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  scroll: { padding: Spacing.md, paddingBottom: 80 },
  card: { padding: Spacing.md, marginBottom: Spacing.md },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.sm,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: FontSizes.xs, fontWeight: '600' },
  groupLabel: { fontSize: 10, letterSpacing: 1.3, fontWeight: '700' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  itemName: { fontSize: FontSizes.sm, fontWeight: '600' },
  itemFrom: { fontSize: FontSizes.xs, marginTop: 2 },
  emptyBody: { fontSize: FontSizes.sm, lineHeight: 20 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: FontSizes.sm, fontWeight: '600' },
  footer: { fontSize: FontSizes.xs, textAlign: 'center', marginTop: 14 },
});
