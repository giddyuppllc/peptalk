/**
 * Pantry Suggestions — AI meal ideas using the user's pantry.
 *
 * Pro-gated. Sends pantry inventory + macro targets to the
 * aimee-pantry-meal edge function and renders the returned
 * meal cards with "From my pantry" badges on matched ingredients.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { PaywallGate } from '../../src/hooks/useFeatureGate';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { usePantryStore } from '../../src/store/usePantryStore';
import { useMealStore } from '../../src/store/useMealStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { useAllergyStore } from '../../src/store/useAllergyStore';
import { supabase } from '../../src/services/supabase';

interface SuggestedIngredient {
  name: string;
  qty?: number;
  unit?: string;
  fromPantry?: boolean;
}

interface Suggestion {
  name: string;
  description?: string;
  cookingMethod?: string;
  prepMinutes?: number;
  ingredients?: SuggestedIngredient[];
  estimatedMacros?: {
    calories?: number;
    proteinGrams?: number;
    carbsGrams?: number;
    fatGrams?: number;
  };
  notes?: string;
}

const MEAL_TYPES: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
];

function inferMealType(): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snack';
  return 'dinner';
}

function PantrySuggestionsInner() {
  const router = useRouter();
  const t = useTheme();
  const items = usePantryStore((s) => s.items);
  const consumeQuantity = usePantryStore((s) => s.consumeQuantity);
  const targets = useMealStore((s) => s.targets);
  const addMeal = useMealStore((s) => s.addMeal);
  // Select protocols array directly and filter via useMemo. Inline filter
  // returned a fresh array every render → infinite Zustand-driven loop.
  const protocols = useDoseLogStore((s) => s.protocols);
  const activeStackPeptides = useMemo(
    () => protocols.filter((p) => p.isActive).map((p) => p.peptideId),
    [protocols],
  );

  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>(inferMealType());
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const perMealTargets = useMemo(() => {
    // Rough split: breakfast 25%, lunch 30%, dinner 35%, snack 10%
    const splits: Record<typeof mealType, number> = {
      breakfast: 0.25,
      lunch: 0.3,
      dinner: 0.35,
      snack: 0.1,
    };
    const share = splits[mealType];
    return {
      calories: Math.round(targets.calories * share),
      proteinGrams: Math.round(targets.proteinGrams * share),
      carbsGrams: Math.round(targets.carbsGrams * share),
      fatGrams: Math.round(targets.fatGrams * share),
    };
  }, [targets, mealType]);

  const handleGenerate = async () => {
    setLoading(true);
    setSuggestions([]);
    try {
      // Collect allergens — structured store + legacy profile fields.
      const profile = useHealthProfileStore.getState().profile;
      const structuredAllergens = useAllergyStore.getState().allergens;
      const allergens = Array.from(
        new Set(
          [
            ...(profile?.medical?.allergies ?? []),
            ...(profile?.nutrition?.foodAllergies ?? []),
            ...structuredAllergens.map((a) => a.label),
          ].filter(Boolean),
        ),
      );
      const { data, error } = await supabase.functions.invoke('aimee-pantry-meal', {
        body: {
          pantryItems: items.map((i) => ({
            name: i.name,
            brand: i.brand,
            quantity: i.quantity,
            unit: i.unit,
            category: i.category,
            storageLocation: i.storageLocation,
            expiryDate: i.expiryDate,
          })),
          macroTargets: perMealTargets,
          mealType,
          activeStackPeptides,
          allergens,
          count: 3,
        },
      });
      if (error) throw error;
      const list = (data?.suggestions ?? []) as Suggestion[];
      if (list.length === 0) {
        Alert.alert('No suggestions', 'The AI couldn\'t generate meals — try again with more pantry items.');
      }
      setSuggestions(list);
    } catch (err: any) {
      const msg = err?.message ?? 'Could not fetch suggestions.';
      if (msg.includes('Pro tier')) {
        Alert.alert('Upgrade required', 'AI meal suggestions are a Pro feature.');
      } else {
        Alert.alert('Failed', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogSuggestion = (s: Suggestion) => {
    const macros = s.estimatedMacros ?? {};
    const ingredientsText = (s.ingredients ?? [])
      .map((ing) =>
        ing.qty && ing.unit ? `${ing.qty} ${ing.unit} ${ing.name}` : ing.name,
      )
      .join(', ');
    const now = new Date();
    addMeal({
      id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: now.toISOString().slice(0, 10),
      mealType,
      foods: [
        {
          foodId: `ai-${Date.now()}`,
          foodName: s.name,
          servings: 1,
          calories: macros.calories ?? 0,
          proteinGrams: macros.proteinGrams ?? 0,
          carbsGrams: macros.carbsGrams ?? 0,
          fatGrams: macros.fatGrams ?? 0,
        },
      ],
      notes: ingredientsText,
      timestamp: now.toISOString(),
    });

    // Deduct any pantry-sourced ingredients so the list reflects reality.
    // Case-insensitive match on name + brand — same way the AI flagged them.
    let deductedCount = 0;
    for (const ing of s.ingredients ?? []) {
      if (!ing.fromPantry || !ing.name) continue;
      const needle = ing.name.toLowerCase().trim();
      const match = items.find(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          needle.includes(p.name.toLowerCase()),
      );
      if (match) {
        // If units match, use the AI-suggested qty; otherwise subtract 1 unit
        // of the pantry item. Better to under-deduct than over-deduct when
        // the units disagree (e.g., "2 tbsp olive oil" vs "1 bottle").
        const sameUnit =
          ing.unit && match.unit &&
          ing.unit.toLowerCase() === match.unit.toLowerCase();
        const amount = sameUnit && ing.qty && ing.qty > 0 ? ing.qty : 1;
        consumeQuantity(match.id, amount);
        deductedCount++;
      }
    }

    Alert.alert(
      'Logged',
      deductedCount > 0
        ? `"${s.name}" added to your ${mealType}. ${deductedCount} pantry item${deductedCount === 1 ? '' : 's'} updated.`
        : `"${s.name}" added to your ${mealType}.`,
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Pantry Suggestions</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={[styles.lead, { color: t.text }]}>
            Meals you can make tonight
          </Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>
            I'll suggest {items.length > 0 ? 'meals built from' : 'meals using'}{' '}
            {items.length > 0 ? `${items.length} pantry item${items.length !== 1 ? 's' : ''}` : 'common household items'}
            , tuned to your macro targets.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Meal type</Text>
          <View style={styles.mealTypeRow}>
            {MEAL_TYPES.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMealType(m)}
                style={[
                  styles.mealTypeChip,
                  mealType === m && { backgroundColor: t.primary },
                ]}
              >
                <Text
                  style={[
                    styles.mealTypeChipText,
                    { color: mealType === m ? '#fff' : t.textSecondary },
                  ]}
                >
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.targetHint, { color: t.textSecondary }]}>
            Target: {perMealTargets.calories} cal · {perMealTargets.proteinGrams}p ·{' '}
            {perMealTargets.carbsGrams}c · {perMealTargets.fatGrams}f
          </Text>
        </View>

        <View style={styles.section}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={t.primary} />
              <Text style={[styles.loadingText, { color: t.textSecondary }]}>
                Thinking up meals…
              </Text>
            </View>
          ) : (
            <GradientButton
              label={suggestions.length > 0 ? 'Generate new ideas' : 'Suggest 3 meals'}
              onPress={handleGenerate}
            />
          )}
        </View>

        {suggestions.map((s, idx) => (
          <View key={idx} style={styles.section}>
            <GlassCard>
              <Text style={[styles.mealName, { color: t.text }]}>{s.name}</Text>
              {s.description && (
                <Text style={[styles.mealDesc, { color: t.textSecondary }]}>
                  {s.description}
                </Text>
              )}
              <View style={styles.metaRow}>
                {s.cookingMethod && (
                  <View style={styles.metaChip}>
                    <Ionicons name="flame-outline" size={12} color={t.textSecondary} />
                    <Text style={[styles.metaText, { color: t.textSecondary }]}>
                      {s.cookingMethod}
                    </Text>
                  </View>
                )}
                {s.prepMinutes != null && (
                  <View style={styles.metaChip}>
                    <Ionicons name="time-outline" size={12} color={t.textSecondary} />
                    <Text style={[styles.metaText, { color: t.textSecondary }]}>
                      {s.prepMinutes} min
                    </Text>
                  </View>
                )}
                {s.estimatedMacros?.calories != null && (
                  <View style={styles.metaChip}>
                    <Ionicons name="nutrition-outline" size={12} color={t.textSecondary} />
                    <Text style={[styles.metaText, { color: t.textSecondary }]}>
                      {s.estimatedMacros.calories} cal · {s.estimatedMacros.proteinGrams ?? 0}p
                    </Text>
                  </View>
                )}
              </View>

              {(s.ingredients ?? []).length > 0 && (
                <View style={styles.ingBlock}>
                  <Text style={[styles.ingHeader, { color: t.textSecondary }]}>Ingredients</Text>
                  {(s.ingredients ?? []).map((ing, i) => (
                    <View key={i} style={styles.ingRow}>
                      <Text
                        style={[
                          styles.ingName,
                          { color: t.text },
                          ing.fromPantry && { fontWeight: '700' },
                        ]}
                      >
                        {ing.qty && ing.unit ? `${ing.qty} ${ing.unit} · ` : ''}
                        {ing.name}
                      </Text>
                      {ing.fromPantry && (
                        <View style={styles.pantryBadge}>
                          <Ionicons name="checkmark-circle" size={10} color={Colors.almostAquaDeep} />
                          <Text style={styles.pantryBadgeText}>In pantry</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {s.notes && (
                <Text style={[styles.notes, { color: t.textSecondary }]}>💡 {s.notes}</Text>
              )}

              <TouchableOpacity
                style={[styles.logBtn, { backgroundColor: t.primary }]}
                onPress={() => handleLogSuggestion(s)}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.logBtnText}>Log as {mealType}</Text>
              </TouchableOpacity>
            </GlassCard>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function PantrySuggestionsScreen() {
  return (
    <PaywallGate feature="recipe_generator">
      <PantrySuggestionsInner />
    </PaywallGate>
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
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  lead: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
    marginBottom: 4,
  },
  body: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  mealTypeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  mealTypeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  mealTypeChipText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  targetHint: {
    fontSize: FontSizes.xs,
    fontStyle: 'italic',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  loadingText: {
    fontSize: FontSizes.sm,
  },
  mealName: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
    marginBottom: 4,
  },
  mealDesc: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  metaText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ingBlock: {
    marginTop: 4,
    marginBottom: 10,
  },
  ingHeader: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  ingName: {
    fontSize: FontSizes.sm,
    flex: 1,
  },
  pantryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: 'rgba(127,179,194,0.12)',
  },
  pantryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.almostAquaDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  notes: {
    fontSize: FontSizes.xs,
    fontStyle: 'italic',
    marginBottom: 10,
    lineHeight: 16,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  logBtnText: {
    color: '#fff',
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
});
