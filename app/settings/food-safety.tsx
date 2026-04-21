/**
 * Food Safety Settings — lets the user override the USDA default
 * fridge/freezer windows per protein category. Saved to the meal store's
 * `foodSafetyOverrides` slice and consumed by computeSafetyStatus().
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useMealStore } from '../../src/store/useMealStore';
import {
  DEFAULT_SAFETY_WINDOWS,
  PROTEIN_CATEGORY_LABELS,
  type ProteinCategory,
} from '../../src/data/foodSafety';

const CATEGORIES: ProteinCategory[] = [
  'chicken',
  'fish',
  'eggs',
  'pork',
  'beef',
  'vegetarian',
  'other',
];

export default function FoodSafetySettingsScreen() {
  const router = useRouter();
  const t = useTheme();
  const overrides = useMealStore((s) => s.foodSafetyOverrides);
  const setOverride = useMealStore((s) => s.setFoodSafetyOverride);
  const clearOverride = useMealStore((s) => s.clearFoodSafetyOverride);

  // Local editing state keyed by category so inputs can be partially typed
  const [drafts, setDrafts] = useState<
    Partial<Record<ProteinCategory, { fridge: string; freezer: string }>>
  >({});

  const getDraft = (cat: ProteinCategory) => {
    const override = overrides[cat];
    return (
      drafts[cat] ?? {
        fridge: override?.fridgeDays !== undefined ? String(override.fridgeDays) : '',
        freezer:
          override?.freezerMonths !== undefined ? String(override.freezerMonths) : '',
      }
    );
  };

  const updateDraft = (
    cat: ProteinCategory,
    field: 'fridge' | 'freezer',
    value: string,
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [cat]: { ...getDraft(cat), [field]: value },
    }));
  };

  const saveCategory = (cat: ProteinCategory) => {
    const d = getDraft(cat);
    const fridge = d.fridge.trim() === '' ? undefined : Math.max(1, parseInt(d.fridge, 10));
    const freezer =
      d.freezer.trim() === '' ? undefined : Math.max(0, parseInt(d.freezer, 10));
    if (fridge === undefined && freezer === undefined) {
      clearOverride(cat);
    } else {
      setOverride(cat, {
        ...(fridge !== undefined && !Number.isNaN(fridge) ? { fridgeDays: fridge } : {}),
        ...(freezer !== undefined && !Number.isNaN(freezer) ? { freezerMonths: freezer } : {}),
      });
    }
    // Clear the draft so the UI re-reads from the persisted override
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[cat];
      return next;
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Food Safety</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.introBox}>
          <Ionicons name="information-circle-outline" size={18} color={t.textSecondary} />
          <Text style={[styles.introText, { color: t.textSecondary }]}>
            These are USDA-based safe storage windows for cooked food. You can override any
            category if your kitchen (or leftovers) require different timing. Leave blank to
            use the default.
          </Text>
        </View>

        {CATEGORIES.map((cat) => {
          const def = DEFAULT_SAFETY_WINDOWS[cat];
          const draft = getDraft(cat);
          const hasOverride = overrides[cat] !== undefined;
          return (
            <View key={cat} style={styles.section}>
              <GlassCard>
                <View style={styles.rowHeader}>
                  <Text style={[styles.catTitle, { color: t.text }]}>
                    {PROTEIN_CATEGORY_LABELS[cat]}
                  </Text>
                  {hasOverride && (
                    <TouchableOpacity onPress={() => saveCategory(cat)}>
                      <Text style={[styles.resetLink, { color: t.primary }]}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>
                      Fridge (days)
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                      value={draft.fridge}
                      onChangeText={(v) => updateDraft(cat, 'fridge', v)}
                      onBlur={() => saveCategory(cat)}
                      placeholder={String(def.fridgeDays)}
                      placeholderTextColor={t.placeholder}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>
                      Freezer (months)
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                      value={draft.freezer}
                      onChangeText={(v) => updateDraft(cat, 'freezer', v)}
                      onBlur={() => saveCategory(cat)}
                      placeholder={String(def.freezerMonths)}
                      placeholderTextColor={t.placeholder}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                <Text style={[styles.hint, { color: t.textSecondary }]}>
                  Default: {def.fridgeDays} days fridge · {def.freezerMonths} months freezer
                  {def.highRisk ? ' · high-risk (freeze-soon at day 2)' : ''}
                </Text>
              </GlassCard>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#2D2D2D',
  },
  introBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  introText: {
    flex: 1,
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  catTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  resetLink: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 12,
    height: 40,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  hint: {
    marginTop: 10,
    fontSize: FontSizes.xs,
    fontStyle: 'italic',
  },
});
