/**
 * Build a meal from your pantry.
 *
 * The user picks N pantry items + a quantity-to-use stepper for each,
 * names the meal, picks meal-type, taps "Save and log":
 *   1. Builds a MealEntry.foods[] from each picked item's stored
 *      nutrition snapshot (added on pantry-add via aimee-pantry-scan
 *      / aimee-pantry-parse). When a snapshot is missing, we ship a
 *      zero-macro placeholder line and surface it in a footnote — the
 *      user can correct the meal entry later from the standard log.
 *   2. Calls useMealStore.addMeal so it lands on today's totals.
 *   3. Calls usePantryStore.consumeQuantity on each picked item.
 *   4. Optionally calls useMealStore.addMealTemplate so the user can
 *      one-tap re-log the same combination tomorrow.
 *
 * Aimee's `add_to_pantry` confirm card links here as a "Cook something
 * with these?" follow-up. The Nutrition tab also links here from the
 * "Scan your kitchen" card via a small "Build a meal" action under the
 * pantry-suggestions screen.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { usePantryStore, type PantryItem, type StorageLocation } from '../../src/store/usePantryStore';
import { useMealStore } from '../../src/store/useMealStore';
import type { MealType } from '../../src/types/fitness';

const LOCATION_LABELS: Record<StorageLocation, string> = {
  fridge: 'Fridge',
  freezer: 'Freezer',
  pantry: 'Pantry',
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inferMealType(): MealType {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snack';
  return 'dinner';
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function CustomMealFromPantryScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const items = usePantryStore((s) => s.items);
  const consumeQuantity = usePantryStore((s) => s.consumeQuantity);
  const addMeal = useMealStore((s) => s.addMeal);
  const addMealTemplate = useMealStore((s) => s.addMealTemplate);

  const [picks, setPicks] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<MealType>(inferMealType());
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // Group items by storage so the picker reads like "look in your fridge,
  // your freezer, then the cupboard." Empty groups stay hidden.
  const grouped = useMemo(() => {
    const out: Record<StorageLocation, PantryItem[]> = {
      fridge: [],
      freezer: [],
      pantry: [],
    };
    for (const it of items) out[it.storageLocation].push(it);
    return out;
  }, [items]);

  const totals = useMemo(() => {
    let cal = 0, p = 0, c = 0, f = 0, fib = 0;
    let missingMacros = 0;
    for (const it of items) {
      const used = picks[it.id] ?? 0;
      if (used <= 0) continue;
      const snap = it.nutrition?.perServing;
      if (!snap) {
        missingMacros += 1;
        continue;
      }
      cal += (snap.calories ?? 0) * used;
      p += (snap.proteinGrams ?? 0) * used;
      c += (snap.carbsGrams ?? 0) * used;
      f += (snap.fatGrams ?? 0) * used;
      fib += (snap.fiberGrams ?? 0) * used;
    }
    return {
      calories: Math.round(cal),
      proteinGrams: Math.round(p),
      carbsGrams: Math.round(c),
      fatGrams: Math.round(f),
      fiberGrams: Math.round(fib),
      missingMacros,
    };
  }, [items, picks]);

  const pickedCount = useMemo(
    () => Object.values(picks).filter((v) => v > 0).length,
    [picks],
  );

  const bump = (id: string, delta: number, max: number) => {
    tapLight();
    setPicks((prev) => {
      const next = Math.max(0, Math.min(max, (prev[id] ?? 0) + delta));
      return { ...prev, [id]: next };
    });
  };

  const handleSave = () => {
    if (pickedCount === 0) {
      Alert.alert('Pick at least one ingredient', 'Tap + on a pantry item to add it.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Name your meal', 'Give it a short name like "Greek yogurt bowl".');
      return;
    }

    // Build the foods array from each picked item.
    const foods = items
      .filter((it) => (picks[it.id] ?? 0) > 0)
      .map((it) => {
        const used = picks[it.id]!;
        const snap = it.nutrition?.perServing;
        return {
          foodId: uid('pantry-food'),
          foodName: it.name,
          servings: used,
          calories: Math.round((snap?.calories ?? 0) * used),
          proteinGrams: Math.round((snap?.proteinGrams ?? 0) * used),
          carbsGrams: Math.round((snap?.carbsGrams ?? 0) * used),
          fatGrams: Math.round((snap?.fatGrams ?? 0) * used),
          fiberGrams: Math.round((snap?.fiberGrams ?? 0) * used),
        };
      });

    addMeal({
      id: uid('meal'),
      date: todayKey(),
      mealType,
      foods,
      timestamp: new Date().toISOString(),
      notes: `Built from pantry: ${name.trim()}`,
      quickLog: {
        description: name.trim(),
        calories: totals.calories,
        proteinGrams: totals.proteinGrams,
        carbsGrams: totals.carbsGrams,
        fatGrams: totals.fatGrams,
      },
    } as any);

    // Decrement pantry per picked item.
    for (const it of items) {
      const used = picks[it.id] ?? 0;
      if (used > 0) consumeQuantity(it.id, used);
    }

    if (saveAsTemplate) {
      addMealTemplate({
        id: uid('mt'),
        name: name.trim(),
        defaultMealType: mealType,
        foods,
        totalCalories: totals.calories,
        totalProteinGrams: totals.proteinGrams,
        totalCarbsGrams: totals.carbsGrams,
        totalFatGrams: totals.fatGrams,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);
    }

    tapMedium();
    router.back();
  };

  const stepperColor = t.colors.textPrimary as string;
  const subColor = t.colors.textSecondary as string;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: t.colors.bgBase1 as string }}
      edges={['top', 'bottom']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={stepperColor} />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            {
              color: stepperColor,
              fontFamily: t.isDark
                ? t.typography.headlineMale
                : t.typography.headlineFemale,
            },
          ]}
        >
          Build from pantry
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 160 }}>
        {/* Name + meal type */}
        <Text style={[styles.label, { color: subColor }]}>Meal name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Greek yogurt bowl"
          placeholderTextColor={subColor}
          style={[
            styles.input,
            { color: stepperColor, borderColor: 'rgba(0,0,0,0.12)' },
          ]}
        />

        <Text style={[styles.label, { color: subColor, marginTop: 14 }]}>Meal type</Text>
        <View style={styles.chipsRow}>
          {MEAL_TYPES.map((m) => {
            const active = m === mealType;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  tapLight();
                  setMealType(m);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? stepperColor : 'transparent',
                    borderColor: stepperColor,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Set meal type to ${m}`}
              >
                <Text
                  style={{
                    color: active ? (t.colors.bgBase1 as string) : stepperColor,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 12,
                  }}
                >
                  {m}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Pantry list grouped by storage */}
        {(['fridge', 'freezer', 'pantry'] as StorageLocation[]).map((loc) => {
          const groupItems = grouped[loc];
          if (groupItems.length === 0) return null;
          return (
            <View key={loc} style={{ marginTop: 22 }}>
              <Text style={[styles.section, { color: subColor }]}>
                {LOCATION_LABELS[loc]} · {groupItems.length}
              </Text>
              {groupItems.map((it) => {
                const used = picks[it.id] ?? 0;
                const max = it.quantity;
                const snap = it.nutrition?.perServing;
                return (
                  <View
                    key={it.id}
                    style={[
                      styles.itemRow,
                      {
                        borderColor:
                          used > 0
                            ? stepperColor
                            : 'rgba(0,0,0,0.08)',
                        backgroundColor:
                          used > 0 ? 'rgba(0,0,0,0.04)' : 'transparent',
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: stepperColor,
                          fontFamily: t.typography.bodyBold,
                        }}
                      >
                        {it.name}
                      </Text>
                      <Text style={{ color: subColor, fontFamily: t.typography.body, fontSize: 12, marginTop: 2 }}>
                        {max} {it.unit}
                        {snap
                          ? ` · ${Math.round(snap.calories)} cal / ${Math.round(snap.proteinGrams)}P each`
                          : ' · macros unknown'}
                      </Text>
                    </View>
                    <View style={styles.stepper}>
                      <Pressable
                        onPress={() => bump(it.id, -1, max)}
                        disabled={used === 0}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Use one less of ${it.name}`}
                      >
                        <Ionicons
                          name="remove-circle"
                          size={26}
                          color={used === 0 ? subColor : stepperColor}
                        />
                      </Pressable>
                      <Text
                        style={{
                          color: stepperColor,
                          fontFamily: t.typography.bodyBold,
                          fontSize: 14,
                          minWidth: 18,
                          textAlign: 'center',
                        }}
                      >
                        {used}
                      </Text>
                      <Pressable
                        onPress={() => bump(it.id, +1, max)}
                        disabled={used >= max}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Use one more of ${it.name}`}
                      >
                        <Ionicons
                          name="add-circle"
                          size={26}
                          color={used >= max ? subColor : stepperColor}
                        />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        {items.length === 0 ? (
          <View style={{ marginTop: 28 }}>
            <Text
              style={{
                color: subColor,
                fontFamily: t.typography.body,
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              Your pantry is empty. Scan your fridge or add a few items first, then come back here.
            </Text>
            <Pressable
              onPress={() => router.push('/pantry/scan' as never)}
              style={[
                styles.scanBtn,
                { backgroundColor: stepperColor },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open pantry scan"
            >
              <Ionicons name="scan-outline" size={18} color={t.colors.bgBase1 as string} />
              <Text
                style={{
                  color: t.colors.bgBase1 as string,
                  fontFamily: t.typography.bodyBold,
                  marginLeft: 8,
                }}
              >
                Scan your kitchen
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {pickedCount > 0 ? (
        <View
          style={[
            styles.footer,
            { backgroundColor: t.colors.bgBase1 as string },
          ]}
        >
          <Text style={[styles.totals, { color: stepperColor, fontFamily: t.typography.bodyBold }]}>
            {totals.calories} cal · {totals.proteinGrams}P / {totals.carbsGrams}C / {totals.fatGrams}F
          </Text>
          {totals.missingMacros > 0 ? (
            <Text style={{ color: subColor, fontFamily: t.typography.body, fontSize: 11, marginTop: 2 }}>
              {totals.missingMacros} item{totals.missingMacros === 1 ? '' : 's'} missing macros — totals
              shown are partial. Add the missing values from the meal entry afterwards.
            </Text>
          ) : null}
          <Pressable
            onPress={() => {
              tapLight();
              setSaveAsTemplate((v) => !v);
            }}
            style={styles.templateRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: saveAsTemplate }}
            accessibilityLabel="Save as quick-log template"
          >
            <View
              style={[
                styles.check,
                {
                  borderColor: stepperColor,
                  backgroundColor: saveAsTemplate ? stepperColor : 'transparent',
                },
              ]}
            >
              {saveAsTemplate ? (
                <Ionicons name="checkmark" size={14} color={t.colors.bgBase1 as string} />
              ) : null}
            </View>
            <Text style={{ color: stepperColor, fontFamily: t.typography.body, fontSize: 13 }}>
              Save as a quick-log template
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            style={[styles.cta, { backgroundColor: stepperColor }]}
            accessibilityRole="button"
            accessibilityLabel="Save and log"
          >
            <Ionicons name="checkmark" size={18} color={t.colors.bgBase1 as string} />
            <Text
              style={{
                color: t.colors.bgBase1 as string,
                fontFamily: t.typography.bodyBold,
                marginLeft: 8,
              }}
            >
              Save and log
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerTitle: { fontSize: 18 },
  label: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 14,
  },
  section: {
    fontSize: 11,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  totals: {
    fontSize: 14,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 12,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 16,
  },
});
