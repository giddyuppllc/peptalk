/**
 * Food Search Screen — MyFitnessPal-style
 *
 * Search across USDA, Open Food Facts, and Nutritionix databases.
 * Select a food → pick serving size (g / oz / cups / pieces) → log it.
 *
 * Route: /nutrition/food-search
 * Params (optional):
 *   mealId   – if provided, adds to an existing meal entry
 *   mealType – pre-selects the meal type chip
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import {
  Colors,
  Spacing,
  FontSizes,
  BorderRadius,
} from '../../src/constants/theme';
import { useMealStore, type RecentFood, type CustomMeal, type MealTemplate } from '../../src/store/useMealStore';
import { computeSafetyStatus, statusBadge, DEFAULT_SAFETY_WINDOWS } from '../../src/data/foodSafety';
import type { FoodItem } from '../../src/types/fitness';
import { useFeatureGate } from '../../src/hooks/useFeatureGate';
import { PaywallModal } from '../../src/components/PaywallModal';
import { LockBadge } from '../../src/components/LockBadge';
import { useTourTarget } from '../../src/hooks/useTourTarget';
import { MealBuilder } from '../../src/components/MealBuilder';
import {
  searchAllFoods,
  calcUnifiedMacros,
  lookupBarcode,
  type UnifiedFood,
} from '../../src/services/foodSearchService';
import type { MealType } from '../../src/types/fitness';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Food category → icon + color mapping
// Uses Ionicons. Barcode-scanned images are preserved; everything else gets an icon.
// ---------------------------------------------------------------------------

interface FoodIcon {
  name: string; // Ionicons name
  color: string;
  bg: string;   // low-alpha background
}

function getFoodIcon(foodName: string, source?: string): FoodIcon {
  const n = (foodName || '').toLowerCase();

  // Meat — chicken/turkey/poultry get drumstick
  if (/chicken|turkey|poultry|wing|thigh|breast|drumstick/.test(n))
    return { name: 'restaurant-outline', color: '#D98C86', bg: '#D98C8618' };
  // Meat — beef/pork/lamb get cutlery
  if (/beef|steak|pork|lamb|bacon|sausage|ham|bison|veal|jerky|burger|meatball|ribs/.test(n))
    return { name: 'restaurant-outline', color: '#B06A66', bg: '#B06A6618' };
  // Fish & seafood
  if (/fish|salmon|tuna|cod|tilapia|shrimp|prawn|crab|lobster|sardine|trout|sushi|sashimi/.test(n))
    return { name: 'fish-outline', color: '#7FB3C2', bg: '#7FB3C218' };
  // Eggs
  if (/egg/.test(n))
    return { name: 'ellipse-outline', color: '#C9A84A', bg: '#C9A84A18' };
  // Dairy
  if (/milk|cheese|yogurt|cream|butter|whey|cottage|mozzarella|cheddar/.test(n))
    return { name: 'water-outline', color: '#7FB3C2', bg: '#7FB3C218' };
  // Grains / bread / pasta
  if (/rice|bread|pasta|oat|cereal|wheat|tortilla|bagel|noodle|granola|cracker|pancake|waffle/.test(n))
    return { name: 'grid-outline', color: '#C9A84A', bg: '#C9A84A18' };
  // Fruits
  if (/apple|banana|berry|grape|orange|mango|peach|pear|melon|fruit|strawberry|blueberry|raspberry|pineapple|watermelon|cherry|kiwi|plum|lemon|lime/.test(n))
    return { name: 'nutrition-outline', color: '#6FA891', bg: '#6FA89118' };
  // Vegetables
  if (/broccoli|spinach|kale|lettuce|carrot|tomato|pepper|onion|vegetable|salad|asparagus|cucumber|celery|zucchini|squash|corn|potato|sweet potato|mushroom|cauliflower|cabbage|peas|green bean/.test(n))
    return { name: 'leaf-outline', color: '#6FA891', bg: '#6FA89118' };
  // Nuts / seeds / fats
  if (/nut|almond|peanut|walnut|cashew|pistachio|seed|avocado|oil|olive/.test(n))
    return { name: 'ellipse-outline', color: '#A08335', bg: '#A0833518' };
  // Beverages
  if (/coffee|tea|latte|espresso|cappuccino|matcha/.test(n))
    return { name: 'cafe-outline', color: '#9B86A4', bg: '#9B86A418' };
  if (/water|sparkling|seltzer/.test(n))
    return { name: 'water-outline', color: '#7FB3C2', bg: '#7FB3C218' };
  if (/juice|smoothie|soda|cola|drink|beverage|shake/.test(n))
    return { name: 'beer-outline', color: '#C9A84A', bg: '#C9A84A18' };
  // Snacks / sweets
  if (/cookie|cake|chocolate|candy|donut|pastry|brownie|ice cream|dessert|pie|muffin/.test(n))
    return { name: 'ice-cream-outline', color: '#D98C86', bg: '#D98C8618' };
  if (/chip|pretzel|popcorn|cracker|bar|snack/.test(n))
    return { name: 'cube-outline', color: '#C9A84A', bg: '#C9A84A18' };
  // Fast food / restaurant
  if (/pizza|taco|burrito|sandwich|sub|wrap|fries|burger|nugget|hot dog/.test(n))
    return { name: 'fast-food-outline', color: '#D98C86', bg: '#D98C8618' };
  // Supplements
  if (/protein|whey|creatine|supplement|vitamin|collagen|bcaa|pre-workout/.test(n))
    return { name: 'fitness-outline', color: '#9B86A4', bg: '#9B86A418' };
  // Default
  return { name: 'ellipse-outline', color: '#6B7280', bg: '#6B728018' };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEAL_TYPES: { key: MealType; label: string; icon: string }[] = [
  { key: 'breakfast',    label: 'Breakfast',    icon: 'sunny-outline' },
  { key: 'lunch',        label: 'Lunch',        icon: 'restaurant-outline' },
  { key: 'dinner',       label: 'Dinner',       icon: 'moon-outline' },
  { key: 'snack',        label: 'Snack',        icon: 'cafe-outline' },
  { key: 'pre_workout',  label: 'Pre-Workout',  icon: 'flash-outline' },
  { key: 'post_workout', label: 'Post-Workout', icon: 'fitness-outline' },
];

type WeightUnit = 'g' | 'oz';

const OZ_TO_GRAMS = 28.3495;

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Portion Picker Modal (MFP-style)
// ---------------------------------------------------------------------------

interface PortionPickerProps {
  food: UnifiedFood | null;
  visible: boolean;
  onClose: () => void;
  onLog: (food: UnifiedFood, grams: number, mealType: MealType) => void;
  initialMealType?: MealType;
}

function PortionPickerModal({
  food,
  visible,
  onClose,
  onLog,
  initialMealType = 'lunch',
}: PortionPickerProps) {
  // Default to the food's natural household serving when the API gave
  // us one (e.g. "1 salad", "1 strip"). Falls back to index 0 if the
  // food doesn't have an explicit defaultServingIdx. Previously this
  // was hardcoded to 0, which made USDA branded foods open on "1 gram"
  // because the universal weight units were the only entries the
  // picker could find.
  const initialIdx = food?.defaultServingIdx ?? 0;
  const [selectedServing, setSelectedServing] = useState(initialIdx);
  const [servingQty, setServingQty] = useState('1');
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [showServingPicker, setShowServingPicker] = useState(false);
  const [showNutritionInfo, setShowNutritionInfo] = useState(false);

  useEffect(() => {
    if (food) {
      setSelectedServing(food.defaultServingIdx ?? 0);
      setServingQty('1');
      setShowServingPicker(false);
      setShowNutritionInfo(false);
    }
  }, [food?.id]);

  let effectiveGrams = 0;
  if (food && food.servings[selectedServing]) {
    // Clamp serving quantity to a sane range. `-3 servings` was
    // accepted and produced negative calories in daily totals; `99999`
    // hung the UI rendering. P0 from input validation audit.
    const rawQty = parseFloat(servingQty);
    const safeQty = Number.isFinite(rawQty) && rawQty > 0
      ? Math.min(rawQty, 50)
      : 0;
    effectiveGrams = food.servings[selectedServing].grams * safeQty;
  }
  const displayGrams = Math.round(effectiveGrams * 10) / 10;

  const macros = food
    ? calcUnifiedMacros(food, effectiveGrams)
    : { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fiberGrams: 0, sodiumMg: undefined as number | undefined, sugarGrams: undefined as number | undefined, cholesterolMg: undefined as number | undefined, saturatedFatGrams: undefined as number | undefined };

  if (!food) return null;

  const currentServing = food.servings[selectedServing];
  // Split servings into food-specific and universal weight units
  const foodServings = food.servings.filter((s) => !s.isUniversal);
  // Split universal units into weight (g/oz/lb/kg) vs volume (cup/tbsp/etc.)
  // so the picker shows them in two clearly-labeled groups instead of
  // one undifferentiated dump.
  const isVolumeLabel = (label: string) => /cup|tablespoon|teaspoon|tbsp|tsp|fl oz/i.test(label);
  const universal = food.servings.filter((s) => s.isUniversal);
  const weightServings = universal.filter((s) => !isVolumeLabel(s.label));
  const volumeServings = universal.filter((s) => isVolumeLabel(s.label));

  const handleLog = () => {
    if (effectiveGrams <= 0) {
      Alert.alert('Enter Amount', 'Please enter how much you ate.');
      return;
    }
    onLog(food, displayGrams, mealType);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />

          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalFoodTitle}>
              {(() => {
                const icon = getFoodIcon(food.name, food.source);
                return (
                  <View style={[styles.foodIconBg, { backgroundColor: icon.bg, width: 44, height: 44, borderRadius: 12 }]}>
                    <Ionicons name={icon.name as any} size={22} color={icon.color} />
                  </View>
                );
              })()}
              <View style={{ flex: 1 }}>
                <Text style={styles.modalFoodName} numberOfLines={2}>{food.name}</Text>
                {food.brand && <Text style={styles.brandText}>{food.brand}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.darkText} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

            {/* ── HOW MUCH? — Quantity + "servings of" + Serving dropdown ── */}
            <Text style={styles.fieldLabel}>How much?</Text>
            <View style={styles.howMuchRow}>
              <TextInput
                style={styles.qtyInput}
                value={servingQty}
                onChangeText={setServingQty}
                keyboardType="decimal-pad"
                placeholder="1"
                placeholderTextColor={Colors.darkTextSecondary}
                returnKeyType="done"
                selectTextOnFocus
              />
              <Text style={styles.servingsOfText}>servings of</Text>
              <TouchableOpacity
                style={styles.servingDropdown}
                onPress={() => setShowServingPicker(!showServingPicker)}
                activeOpacity={0.7}
              >
                <Text style={styles.servingDropdownText} numberOfLines={1}>
                  {currentServing?.label || '1 serving'}
                </Text>
                <Ionicons name={showServingPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.darkTextSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Serving picker (expanded) ── */}
            {showServingPicker && (
              <View style={styles.servingList}>
                {/* Food-specific servings */}
                {foodServings.map((s, _i) => {
                  const idx = food.servings.indexOf(s);
                  const active = selectedServing === idx;
                  return (
                    <TouchableOpacity
                      key={`food-${s.label}-${idx}`}
                      style={[styles.servingListItem, active && styles.servingListItemActive]}
                      onPress={() => { setSelectedServing(idx); setServingQty('1'); setShowServingPicker(false); }}
                    >
                      <Text style={[styles.servingListText, active && styles.servingListTextActive]}>{s.label}</Text>
                      <Text style={[styles.servingListGrams, active && styles.servingListTextActive]}>{Math.round(s.grams)}g</Text>
                      {active && <Ionicons name="checkmark" size={18} color={Colors.almostAquaDeep} />}
                    </TouchableOpacity>
                  );
                })}
                {/* Weight units section */}
                {weightServings.length > 0 && (
                  <View style={styles.servingSectionHeader}>
                    <Text style={styles.servingSectionText}>WEIGHT</Text>
                  </View>
                )}
                {weightServings.map((s, _i) => {
                  const idx = food.servings.indexOf(s);
                  const active = selectedServing === idx;
                  return (
                    <TouchableOpacity
                      key={`weight-${s.label}-${idx}`}
                      style={[styles.servingListItem, active && styles.servingListItemActive]}
                      onPress={() => { setSelectedServing(idx); setServingQty('1'); setShowServingPicker(false); }}
                    >
                      <Text style={[styles.servingListText, active && styles.servingListTextActive]}>{s.label}</Text>
                      <Text style={[styles.servingListGrams, active && styles.servingListTextActive]}>{s.grams < 1 ? s.grams : Math.round(s.grams)}g</Text>
                      {active && <Ionicons name="checkmark" size={18} color={Colors.almostAquaDeep} />}
                    </TouchableOpacity>
                  );
                })}
                {/* Volume section — cups, tbsp, tsp, fl oz. Labels say
                    "approx" so the user knows these are best-guess for any
                    food that didn't ship a per-food cup serving from USDA. */}
                {volumeServings.length > 0 && (
                  <View style={styles.servingSectionHeader}>
                    <Text style={styles.servingSectionText}>VOLUME (APPROX)</Text>
                  </View>
                )}
                {volumeServings.map((s) => {
                  const idx = food.servings.indexOf(s);
                  const active = selectedServing === idx;
                  return (
                    <TouchableOpacity
                      key={`vol-${s.label}-${idx}`}
                      style={[styles.servingListItem, active && styles.servingListItemActive]}
                      onPress={() => { setSelectedServing(idx); setServingQty('1'); setShowServingPicker(false); }}
                    >
                      <Text style={[styles.servingListText, active && styles.servingListTextActive]}>{s.label}</Text>
                      <Text style={[styles.servingListGrams, active && styles.servingListTextActive]}>≈{Math.round(s.grams)}g</Text>
                      {active && <Ionicons name="checkmark" size={18} color={Colors.almostAquaDeep} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── CALORIE + MACRO SUMMARY (always visible, compact) ── */}
            {effectiveGrams > 0 && (
              <View style={styles.macroSummary}>
                <Text style={styles.macroSummaryCalNum}>{macros.calories}</Text>
                <Text style={styles.macroSummaryCalLabel}>calories</Text>
                <View style={styles.macroPills}>
                  <View style={[styles.macroPill, { borderColor: Colors.almostAquaDeep + '55' }]}>
                    <Text style={[styles.macroPillValue, { color: Colors.almostAquaDeep }]}>{macros.proteinGrams}g</Text>
                    <Text style={styles.macroPillLabel}>Protein</Text>
                  </View>
                  <View style={[styles.macroPill, { borderColor: Colors.pepBlue + '55' }]}>
                    <Text style={[styles.macroPillValue, { color: Colors.pepBlue }]}>{macros.carbsGrams}g</Text>
                    <Text style={styles.macroPillLabel}>Carbs</Text>
                  </View>
                  <View style={[styles.macroPill, { borderColor: '#a855f7' + '55' }]}>
                    <Text style={[styles.macroPillValue, { color: '#a855f7' }]}>{macros.fatGrams}g</Text>
                    <Text style={styles.macroPillLabel}>Fat</Text>
                  </View>
                </View>
                <Text style={styles.weightSummary}>
                  {displayGrams}g · {Math.round(effectiveGrams / OZ_TO_GRAMS * 10) / 10} oz
                </Text>
              </View>
            )}

            {/* ── MEAL TYPE ── */}
            <Text style={styles.fieldLabel}>Meal</Text>
            <View style={styles.mealTypeGrid}>
              {MEAL_TYPES.map((mt) => (
                <TouchableOpacity
                  key={mt.key}
                  style={[styles.mealTypeChip, mealType === mt.key && styles.mealTypeChipActive]}
                  onPress={() => setMealType(mt.key)}
                >
                  <Ionicons
                    name={mt.icon as any}
                    size={14}
                    color={mealType === mt.key ? '#fff' : Colors.darkTextSecondary}
                  />
                  <Text style={[styles.mealTypeText, mealType === mt.key && styles.mealTypeTextActive]}>
                    {mt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── NUTRITION INFO (collapsible) ── */}
            <TouchableOpacity
              style={styles.nutritionInfoBtn}
              onPress={() => setShowNutritionInfo(!showNutritionInfo)}
            >
              <Ionicons name={showNutritionInfo ? 'list' : 'list-outline'} size={16} color={Colors.almostAquaDeep} />
              <Text style={styles.nutritionInfoBtnText}>
                {showNutritionInfo ? 'Hide Nutrition Info' : 'Nutrition Info'}
              </Text>
              <Ionicons name={showNutritionInfo ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.almostAquaDeep} />
            </TouchableOpacity>

            {showNutritionInfo && (
              <View style={styles.nutritionLabel}>
                <Text style={styles.nutritionTitle}>Nutrition Facts</Text>
                <View style={styles.nutritionServingRow}>
                  <Text style={styles.nutritionServingLabel}>Serving size</Text>
                  <Text style={styles.nutritionServingValue}>
                    {parseFloat(servingQty) || 1} × {currentServing?.label ?? '1 serving'} ({Math.round(effectiveGrams)}g)
                  </Text>
                </View>
                <View style={styles.nutritionSeparatorThick} />
                <View style={styles.nutritionRow}>
                  <Text style={styles.nutritionRowLabel}>Calories</Text>
                  <Text style={styles.nutritionRowValueBig}>{macros.calories}</Text>
                </View>
                <View style={styles.nutritionSeparator} />
                <View style={styles.nutritionRow}>
                  <Text style={styles.nutritionRowLabelBold}>Total Fat</Text>
                  <Text style={styles.nutritionRowValue}>{macros.fatGrams}g</Text>
                </View>
                {macros.saturatedFatGrams != null && macros.saturatedFatGrams > 0 && (
                  <><View style={styles.nutritionSeparatorThin} /><View style={styles.nutritionRow}><Text style={styles.nutritionRowLabelIndent}>Saturated Fat</Text><Text style={styles.nutritionRowValue}>{macros.saturatedFatGrams}g</Text></View></>
                )}
                <View style={styles.nutritionSeparator} />
                {macros.cholesterolMg != null && macros.cholesterolMg > 0 && (
                  <><View style={styles.nutritionRow}><Text style={styles.nutritionRowLabelBold}>Cholesterol</Text><Text style={styles.nutritionRowValue}>{macros.cholesterolMg}mg</Text></View><View style={styles.nutritionSeparator} /></>
                )}
                {macros.sodiumMg != null && macros.sodiumMg > 0 && (
                  <><View style={styles.nutritionRow}><Text style={styles.nutritionRowLabelBold}>Sodium</Text><Text style={styles.nutritionRowValue}>{macros.sodiumMg}mg</Text></View><View style={styles.nutritionSeparator} /></>
                )}
                <View style={styles.nutritionRow}>
                  <Text style={styles.nutritionRowLabelBold}>Total Carbs</Text>
                  <Text style={styles.nutritionRowValue}>{macros.carbsGrams}g</Text>
                </View>
                <View style={styles.nutritionSeparatorThin} />
                <View style={styles.nutritionRow}>
                  <Text style={styles.nutritionRowLabelIndent}>Fiber</Text>
                  <Text style={styles.nutritionRowValue}>{macros.fiberGrams}g</Text>
                </View>
                {macros.sugarGrams != null && macros.sugarGrams > 0 && (
                  <><View style={styles.nutritionSeparatorThin} /><View style={styles.nutritionRow}><Text style={styles.nutritionRowLabelIndent}>Sugars</Text><Text style={styles.nutritionRowValue}>{macros.sugarGrams}g</Text></View></>
                )}
                <View style={styles.nutritionSeparator} />
                <View style={styles.nutritionRow}>
                  <Text style={styles.nutritionRowLabelBold}>Protein</Text>
                  <Text style={styles.nutritionRowValue}>{macros.proteinGrams}g</Text>
                </View>
                <View style={styles.nutritionSeparatorThick} />
              </View>
            )}
          </ScrollView>

          {/* Add Food button */}
          <View style={styles.logBtnWrapper}>
            <GradientButton
              label={effectiveGrams > 0 ? `Add Food — ${macros.calories} cal` : 'Enter amount to add'}
              onPress={handleLog}
              disabled={effectiveGrams <= 0}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Custom Food Creation Modal
// ---------------------------------------------------------------------------

interface CustomFoodModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (food: UnifiedFood) => void;
}

function CustomFoodModal({ visible, onClose, onSave }: CustomFoodModalProps) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [servingSize, setServingSize] = useState('100');
  const [servingLabel, setServingLabel] = useState('1 serving');
  const [cal, setCal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [sodium, setSodium] = useState('');
  const [sugar, setSugar] = useState('');

  const resetForm = () => {
    setName(''); setBrand(''); setServingSize('100'); setServingLabel('1 serving');
    setCal(''); setProtein(''); setCarbs(''); setFat('');
    setFiber(''); setSodium(''); setSugar('');
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a food name.');
      return;
    }
    const servingG = parseFloat(servingSize) || 100;
    const calNum = parseFloat(cal) || 0;
    const proNum = parseFloat(protein) || 0;
    const carbNum = parseFloat(carbs) || 0;
    const fatNum = parseFloat(fat) || 0;

    // Convert per-serving values to per-100g
    const scale = servingG > 0 ? 100 / servingG : 1;

    const food: UnifiedFood = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      brand: brand.trim() || undefined,
      source: 'local',
      per100g: {
        calories: Math.round(calNum * scale),
        proteinGrams: Math.round(proNum * scale * 10) / 10,
        carbsGrams: Math.round(carbNum * scale * 10) / 10,
        fatGrams: Math.round(fatNum * scale * 10) / 10,
        fiberGrams: Math.round((parseFloat(fiber) || 0) * scale * 10) / 10,
        sodiumMg: sodium ? Math.round((parseFloat(sodium) || 0) * scale) : undefined,
        sugarGrams: sugar ? Math.round((parseFloat(sugar) || 0) * scale * 10) / 10 : undefined,
      },
      servings: [
        { label: servingLabel.trim() || '1 serving', grams: servingG },
        { label: '1 gram', grams: 1, isUniversal: true },
        { label: '1 ounce', grams: 28.35, isUniversal: true },
        { label: '1 pound', grams: 453.6, isUniversal: true },
        { label: '1 kilogram', grams: 1000, isUniversal: true },
      ],
      defaultServingGrams: servingG,
      emoji: '🍽️',
    };

    onSave(food);
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          style={[styles.modalContent, { minHeight: '80%' }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <Text style={styles.modalFoodName}>Create Custom Food</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close create custom food">
              <Ionicons name="close" size={22} color={Colors.darkText} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <Text style={styles.fieldLabel}>Food Name *</Text>
            <TextInput
              style={styles.customInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Mom's Chicken Casserole"
              placeholderTextColor={Colors.darkTextSecondary}
            />

            {/* Brand */}
            <Text style={styles.fieldLabel}>Brand (optional)</Text>
            <TextInput
              style={styles.customInput}
              value={brand}
              onChangeText={setBrand}
              placeholder="e.g. Homemade, Trader Joe's"
              placeholderTextColor={Colors.darkTextSecondary}
            />

            {/* Serving */}
            <Text style={styles.fieldLabel}>Serving Size</Text>
            <View style={styles.customRow}>
              <TextInput
                style={[styles.customInput, { flex: 1 }]}
                value={servingLabel}
                onChangeText={setServingLabel}
                placeholder="1 serving"
                placeholderTextColor={Colors.darkTextSecondary}
              />
              <TextInput
                style={[styles.customInput, { width: 80 }]}
                value={servingSize}
                onChangeText={setServingSize}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor={Colors.darkTextSecondary}
              />
              <Text style={styles.customUnitLabel}>g</Text>
            </View>

            {/* Macros header */}
            <Text style={styles.fieldLabel}>Nutrition (per serving)</Text>

            {/* Calories */}
            <View style={styles.customMacroRow}>
              <Text style={styles.customMacroLabel}>Calories</Text>
              <TextInput
                style={styles.customMacroInput}
                value={cal}
                onChangeText={setCal}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>

            {/* Protein */}
            <View style={styles.customMacroRow}>
              <Text style={styles.customMacroLabel}>Protein (g)</Text>
              <TextInput
                style={styles.customMacroInput}
                value={protein}
                onChangeText={setProtein}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>

            {/* Carbs */}
            <View style={styles.customMacroRow}>
              <Text style={styles.customMacroLabel}>Carbs (g)</Text>
              <TextInput
                style={styles.customMacroInput}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>

            {/* Fat */}
            <View style={styles.customMacroRow}>
              <Text style={styles.customMacroLabel}>Fat (g)</Text>
              <TextInput
                style={styles.customMacroInput}
                value={fat}
                onChangeText={setFat}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>

            {/* Optional extras */}
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Optional</Text>

            <View style={styles.customMacroRow}>
              <Text style={styles.customMacroLabel}>Fiber (g)</Text>
              <TextInput
                style={styles.customMacroInput}
                value={fiber}
                onChangeText={setFiber}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>

            <View style={styles.customMacroRow}>
              <Text style={styles.customMacroLabel}>Sugar (g)</Text>
              <TextInput
                style={styles.customMacroInput}
                value={sugar}
                onChangeText={setSugar}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>

            <View style={styles.customMacroRow}>
              <Text style={styles.customMacroLabel}>Sodium (mg)</Text>
              <TextInput
                style={styles.customMacroInput}
                value={sodium}
                onChangeText={setSodium}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.darkTextSecondary}
              />
            </View>
          </ScrollView>

          <View style={styles.logBtnWrapper}>
            <GradientButton label="Save Custom Food" onPress={handleSave} />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Barcode Scanner Modal
// ---------------------------------------------------------------------------

interface BarcodeScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (food: UnifiedFood) => void;
}

function BarcodeScannerModal({ visible, onClose, onScanned }: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const lastScannedRef = useRef<string>('');

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setScanning(false);
      setLookingUp(false);
      lastScannedRef.current = '';
    }
  }, [visible]);

  const handleBarcodeScanned = useCallback(async (result: { data: string; type: string }) => {
    // Prevent duplicate scans
    if (lookingUp || result.data === lastScannedRef.current) return;
    lastScannedRef.current = result.data;
    setLookingUp(true);

    try {
      const food = await lookupBarcode(result.data);
      if (food) {
        onScanned(food);
        onClose();
      } else {
        Alert.alert(
          'Product Not Found',
          `No nutritional data found for barcode ${result.data}. Try searching by name instead.`,
          [{ text: 'OK', onPress: () => { lastScannedRef.current = ''; setLookingUp(false); } }]
        );
      }
    } catch {
      Alert.alert('Error', 'Failed to look up barcode. Please try again.');
      lastScannedRef.current = '';
      setLookingUp(false);
    }
  }, [lookingUp, onScanned, onClose]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.scannerContainer}>
        {!permission?.granted ? (
          <>
            {/* Header for permission screen */}
            <View style={styles.scannerHeaderAbsolute}>
              <SafeAreaView edges={['top']}>
                <View style={styles.scannerHeaderRow}>
                  <TouchableOpacity onPress={onClose} style={styles.scannerCloseBtn}>
                    <Ionicons name="close" size={28} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.scannerTitle}>Scan Barcode</Text>
                  <View style={{ width: 40 }} />
                </View>
              </SafeAreaView>
            </View>
            <View style={styles.scannerPermission}>
              <Ionicons name="camera-outline" size={60} color={Colors.darkTextSecondary} />
              <Text style={styles.scannerPermText}>Camera access is needed to scan barcodes</Text>
              <GradientButton label="Allow Camera Access" onPress={requestPermission} />
            </View>
          </>
        ) : (
          <>
            {/* Full screen camera */}
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
              }}
              onBarcodeScanned={lookingUp ? undefined : handleBarcodeScanned}
            />

            {/* Header floating over camera */}
            <View style={styles.scannerHeaderAbsolute}>
              <SafeAreaView edges={['top']}>
                <View style={styles.scannerHeaderRow}>
                  <TouchableOpacity onPress={onClose} style={styles.scannerCloseBtn}>
                    <Ionicons name="close" size={28} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.scannerTitle}>Scan Barcode</Text>
                  <View style={{ width: 40 }} />
                </View>
              </SafeAreaView>
            </View>

            {/* Scan overlay */}
            <View style={styles.scanOverlay}>
              <View style={styles.scanCutout}>
                <View style={[styles.scanCorner, styles.scanCornerTL]} />
                <View style={[styles.scanCorner, styles.scanCornerTR]} />
                <View style={[styles.scanCorner, styles.scanCornerBL]} />
                <View style={[styles.scanCorner, styles.scanCornerBR]} />
              </View>
              <Text style={styles.scanHint}>
                {lookingUp ? 'Looking up product...' : 'Point camera at barcode'}
              </Text>
              {lookingUp && (
                <ActivityIndicator size="large" color={Colors.almostAquaDeep} style={{ marginTop: 16 }} />
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Food Row
// ---------------------------------------------------------------------------

function FoodRow({ food, onPress }: { food: UnifiedFood; onPress: (food: UnifiedFood) => void }) {
  return (
    <TouchableOpacity
      style={styles.foodRow}
      onPress={() => onPress(food)}
      activeOpacity={0.75}
    >
      {(() => {
        // Barcode-scanned foods keep their verified product image
        if (food.imageUrl && food.barcode) {
          return <Image source={{ uri: food.imageUrl }} style={styles.foodImage} />;
        }
        const icon = getFoodIcon(food.name);
        return (
          <View style={[styles.foodIconBg, { backgroundColor: icon.bg }]}>
            <Ionicons name={icon.name as any} size={20} color={icon.color} />
          </View>
        );
      })()}
      <View style={styles.foodInfo}>
        <Text style={styles.foodName} numberOfLines={1}>{food.name}</Text>
        {food.brand ? (
          <Text style={styles.foodBrand} numberOfLines={1}>{food.brand}</Text>
        ) : null}
        <Text style={styles.foodMacros}>
          {food.per100g.proteinGrams}p · {food.per100g.carbsGrams}c · {food.per100g.fatGrams}f per 100g
        </Text>
      </View>
      <View style={styles.foodCalBadge}>
        <Text style={styles.foodCalNum}>{food.per100g.calories}</Text>
        <Text style={styles.foodCalLabel}>cal</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.darkTextSecondary} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function FoodSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mealId?: string; mealType?: MealType }>();
  const {
    addMeal,
    updateMeal,
    meals,
    recentFoods,
    addRecentFood,
    clearRecentFoods,
    customMeals,
    removeCustomMeal,
    customFoods,
    removeCustomFood,
    mealTemplates,
    removeMealTemplate,
    logMealTemplate,
    logMealTemplateServings,
  } = useMealStore();

  // Meal prep serving picker state
  const [prepPickerTemplate, setPrepPickerTemplate] = useState<MealTemplate | null>(null);
  const [prepServingsInput, setPrepServingsInput] = useState('1');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnifiedFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedFood, setSelectedFood] = useState<UnifiedFood | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [customFoodVisible, setCustomFoodVisible] = useState(false);
  const [mealBuilderVisible, setMealBuilderVisible] = useState(false);
  const [editingMeal, setEditingMeal] = useState<CustomMeal | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'mymeals' | 'myrecipes' | 'myfoods'>('all');
  const [paywallFeature, setPaywallFeature] = useState<string | null>(null);
  const hasVoiceLog = useFeatureGate('voice_log');
  const hasMealScan = useFeatureGate('meal_scan');
  const quickActionsRef = useTourTarget('food_search_quick_actions');
  const foodTabBarRef = useTourTarget('food_search_tab_bar');
  const [successVisible, setSuccessVisible] = useState(false);
  const [lastLogged, setLastLogged] = useState('');
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the success-toast timer on unmount so setState doesn't fire on
  // an unmounted component when the user navigates away mid-3s-window.
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const flashSuccess = useCallback(() => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessVisible(true);
    successTimerRef.current = setTimeout(() => setSuccessVisible(false), 3000);
  }, []);

  const debouncedQuery = useDebounce(query, 400);

  const initialMealType: MealType = (params.mealType as MealType) ?? 'lunch';

  // Convert a recent food back to UnifiedFood for the portion picker
  const recentToUnified = useCallback((r: RecentFood): UnifiedFood => ({
    id: r.foodId,
    name: r.foodName,
    brand: r.brand,
    source: 'local',
    per100g: r.per100g,
    servings: [
      { label: r.servingLabel, grams: r.grams },
      { label: '1 gram', grams: 1, isUniversal: true },
      { label: '1 ounce', grams: 28.35, isUniversal: true },
      { label: '1 pound', grams: 453.6, isUniversal: true },
      { label: '1 kilogram', grams: 1000, isUniversal: true },
    ],
    defaultServingGrams: r.grams,
    emoji: r.emoji,
    imageUrl: r.imageUrl,
  }), []);

  // Search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setHasSearched(true);

    // Both .then AND .catch — earlier audit caught that a network drop
    // or 5xx left the spinner spinning forever because the catch path
    // never fired setLoading(false). Now: every terminal state flips
    // loading off and surfaces an explicit error message when the
    // search itself threw.
    searchAllFoods(debouncedQuery)
      .then((foods) => {
        if (cancelled) return;
        setResults(foods);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (__DEV__) console.warn('[food-search] searchAllFoods failed:', err);
        setResults([]);
        setLoading(false);
        Alert.alert(
          'Search failed',
          'Couldn\'t reach the food database. Check your connection and try again.',
        );
      });

    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleFoodPress = useCallback((food: UnifiedFood) => {
    setSelectedFood(food);
    setPickerVisible(true);
  }, []);

  const handleBarcodeScanned = useCallback((food: UnifiedFood) => {
    setScannerVisible(false);
    setSelectedFood(food);
    setPickerVisible(true);
  }, []);

  const handleCustomFoodSaved = useCallback((food: UnifiedFood) => {
    setSelectedFood(food);
    setPickerVisible(true);
  }, []);

  // Convert a custom meal to UnifiedFood so it can use the portion picker (log by total weight)
  const handleLogCustomMeal = useCallback((meal: CustomMeal) => {
    // Build per-100g from the recipe totals
    const scale = meal.totalGrams > 0 ? 100 / meal.totalGrams : 1;
    const food: UnifiedFood = {
      id: `meal-${meal.id}`,
      name: meal.name,
      source: 'local',
      per100g: {
        calories: Math.round(meal.totalCalories * scale),
        proteinGrams: Math.round(meal.totalProteinGrams * scale * 10) / 10,
        carbsGrams: Math.round(meal.totalCarbsGrams * scale * 10) / 10,
        fatGrams: Math.round(meal.totalFatGrams * scale * 10) / 10,
        fiberGrams: Math.round(meal.totalFiberGrams * scale * 10) / 10,
      },
      servings: [
        { label: `Full recipe (${meal.totalGrams}g)`, grams: meal.totalGrams },
        { label: '½ recipe', grams: Math.round(meal.totalGrams / 2) },
        { label: '⅓ recipe', grams: Math.round(meal.totalGrams / 3) },
        { label: '¼ recipe', grams: Math.round(meal.totalGrams / 4) },
        { label: '1 gram', grams: 1, isUniversal: true },
        { label: '1 ounce', grams: 28.35, isUniversal: true },
        { label: '1 pound', grams: 453.6, isUniversal: true },
      ],
      defaultServingGrams: meal.totalGrams,
      emoji: '🍱',
    };
    setSelectedFood(food);
    setPickerVisible(true);
  }, []);

  // Convert a user-created FoodItem (from My Foods tab) to a UnifiedFood for the portion picker
  const handleCustomFoodItemPress = useCallback((item: FoodItem) => {
    const grams = item.servingGrams || 100;
    const scale = grams > 0 ? 100 / grams : 1;
    const food: UnifiedFood = {
      id: `myfood-${item.id}`,
      name: item.name,
      source: 'local',
      per100g: {
        calories: Math.round(item.calories * scale),
        proteinGrams: Math.round(item.proteinGrams * scale * 10) / 10,
        carbsGrams: Math.round(item.carbsGrams * scale * 10) / 10,
        fatGrams: Math.round(item.fatGrams * scale * 10) / 10,
        fiberGrams: Math.round((item.fiberGrams || 0) * scale * 10) / 10,
      },
      servings: [
        { label: item.servingSize || `${grams}g`, grams },
        { label: '1 gram', grams: 1, isUniversal: true },
        { label: '1 ounce', grams: 28.35, isUniversal: true },
        { label: '1 pound', grams: 453.6, isUniversal: true },
      ],
      defaultServingGrams: grams,
      emoji: '🥗',
    };
    setSelectedFood(food);
    setPickerVisible(true);
  }, []);

  const handleLog = useCallback(
    (food: UnifiedFood, grams: number, mealType: MealType) => {
      const macros = calcUnifiedMacros(food, grams);
      const dateKey = today();

      const foodEntry = {
        foodId: food.id,
        foodName: `${food.name}${food.brand ? ` (${food.brand})` : ''} — ${grams}g`,
        servings: 1,
        calories: macros.calories,
        proteinGrams: macros.proteinGrams,
        carbsGrams: macros.carbsGrams,
        fatGrams: macros.fatGrams,
        // Micronutrients
        fiberGrams: macros.fiberGrams,
        sodiumMg: macros.sodiumMg,
        sugarGrams: macros.sugarGrams,
        cholesterolMg: macros.cholesterolMg,
        saturatedFatGrams: macros.saturatedFatGrams,
        transFatGrams: macros.transFatGrams,
        potassiumMg: macros.potassiumMg,
        calciumMg: macros.calciumMg,
        ironMg: macros.ironMg,
        vitaminAMcg: macros.vitaminAMcg,
        vitaminCMg: macros.vitaminCMg,
      };

      if (params.mealId) {
        const existing = meals.find((m) => m.id === params.mealId);
        if (existing) {
          updateMeal(params.mealId, {
            foods: [...existing.foods, foodEntry],
          });
        }
      } else {
        addMeal({
          id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          date: dateKey,
          mealType,
          foods: [foodEntry],
          timestamp: new Date().toISOString(),
        });
      }

      // Save to recent foods
      const recentKey = (food.name + (food.brand || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
      addRecentFood({
        key: recentKey,
        foodId: food.id,
        foodName: food.name,
        brand: food.brand,
        servingLabel: food.servings[0]?.label || `${grams}g`,
        grams,
        calories: macros.calories,
        proteinGrams: macros.proteinGrams,
        carbsGrams: macros.carbsGrams,
        fatGrams: macros.fatGrams,
        per100g: food.per100g,
        imageUrl: food.imageUrl,
        emoji: food.emoji,
        loggedAt: new Date().toISOString(),
      });

      setPickerVisible(false);
      setLastLogged(`${food.name} (${grams}g) — ${macros.calories} cal`);
      flashSuccess();
    },
    [addMeal, updateMeal, meals, params.mealId, addRecentFood, flashSuccess],
  );

  // Handle tapping + on a recent food
  const handleRecentPress = useCallback((recent: RecentFood) => {
    setSelectedFood(recentToUnified(recent));
    setPickerVisible(true);
  }, [recentToUnified]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Food Search</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search bar — placeholder swaps per active tab */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <View style={[styles.searchBar, { flex: 1 }]}>
            <Ionicons name="search" size={18} color={Colors.darkTextSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={
                activeTab === 'mymeals' ? 'Search my meals...' :
                activeTab === 'myrecipes' ? 'Search my recipes...' :
                activeTab === 'myfoods' ? 'Search my foods...' :
                'Search foods, brands, flavors...'
              }
              placeholderTextColor={Colors.darkTextSecondary}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={18} color={Colors.darkTextSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* 4-Tab bar — All / My Meals / My Recipes / My Foods */}
      <View ref={foodTabBarRef} style={styles.mfpTabBar}>
        {(['all', 'mymeals', 'myrecipes', 'myfoods'] as const).map((tab) => {
          const labels = { all: 'All', mymeals: 'My Meals', myrecipes: 'My Recipes', myfoods: 'My Foods' };
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={styles.mfpTab}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.mfpTabText, active && styles.mfpTabTextActive]}>
                {labels[tab]}
              </Text>
              {active && <View style={styles.mfpTabUnderline} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Success toast */}
      {successVisible && (
        <View style={styles.successToast}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
          <Text style={styles.successText}>Logged: {lastLogged}</Text>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB CONTENT
          ═══════════════════════════════════════════════════════════════════════ */}

      {/* ── ALL tab ── */}
      {activeTab === 'all' && (
        <>
          {/* Quick Action Row — shown only when not searching */}
          {!hasSearched && (
            <View ref={quickActionsRef} style={styles.quickActionRow}>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => setScannerVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: Colors.almostAquaDeep + '18' }]}>
                  <Ionicons name="barcode-outline" size={22} color={Colors.almostAquaDeep} />
                </View>
                <Text style={styles.quickActionLabel}>Barcode</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => {
                  if (hasVoiceLog) {
                    router.push('/nutrition/voice-log' as any);
                  } else {
                    setPaywallFeature('voice_log');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: Colors.almostAquaDeep + '18' }]}>
                  <Ionicons name="mic-outline" size={22} color={Colors.almostAquaDeep} />
                  {!hasVoiceLog && (
                    <View style={styles.quickActionLock}>
                      <LockBadge tier="plus" size="sm" />
                    </View>
                  )}
                </View>
                <Text style={styles.quickActionLabel}>Voice log</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => {
                  if (hasMealScan) {
                    router.push('/nutrition/meal-scan' as any);
                  } else {
                    setPaywallFeature('meal_scan');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: Colors.almostAquaDeep + '18' }]}>
                  <Ionicons name="scan-outline" size={22} color={Colors.almostAquaDeep} />
                  {!hasMealScan && (
                    <View style={styles.quickActionLock}>
                      <LockBadge tier="pro" size="sm" />
                    </View>
                  )}
                </View>
                <Text style={styles.quickActionLabel}>Meal scan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => setCustomFoodVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: Colors.almostAquaDeep + '18' }]}>
                  <Ionicons name="add-circle-outline" size={22} color={Colors.almostAquaDeep} />
                </View>
                <Text style={styles.quickActionLabel}>Quick add</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Results / suggestions */}
          {loading ? (
            <View style={styles.resultsHeader}>
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={Colors.almostAquaDeep} />
                <Text style={styles.resultsCount}>Searching...</Text>
              </View>
            </View>
          ) : hasSearched ? (
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>
                {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
              </Text>
            </View>
          ) : (
            <View style={styles.suggestionsHeader}>
              <Text style={styles.sectionLabel}>
                {recentFoods.length > 0 ? 'Suggestions' : 'Get started'}
              </Text>
              {recentFoods.length > 0 && (
                <TouchableOpacity onPress={clearRecentFoods}>
                  <Text style={styles.clearLinkText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {hasSearched ? (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <FoodRow food={item} onPress={handleFoodPress} />}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                !loading ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="search-outline" size={40} color={Colors.darkTextSecondary} />
                    <Text style={styles.emptyTitle}>No foods found</Text>
                    <Text style={styles.emptyDesc}>Try a different search term, brand name, or restaurant</Text>
                  </View>
                ) : null
              }
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />
          ) : (
            <FlatList
              data={recentFoods}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.recentRow} onPress={() => handleRecentPress(item)} activeOpacity={0.7}>
                  {(() => {
                    const icon = getFoodIcon(item.foodName);
                    return (
                      <View style={[styles.foodIconBg, { backgroundColor: icon.bg }]}>
                        <Ionicons name={icon.name as any} size={20} color={icon.color} />
                      </View>
                    );
                  })()}
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentName} numberOfLines={1}>{item.foodName}</Text>
                    {item.brand ? <Text style={styles.recentBrand} numberOfLines={1}>{item.brand}</Text> : null}
                    <Text style={styles.recentMeta}>
                      {item.calories} cal, {item.servingLabel}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.recentAddBtn}
                    onPress={() => handleRecentPress(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="add-circle" size={28} color={Colors.almostAquaDeep} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={styles.emptyStateSoft}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="leaf-outline" size={28} color={Colors.almostAquaDeep} />
                  </View>
                  <Text style={styles.emptyTitleBig}>Start logging,{'\n'}we'll remember.</Text>
                  <Text style={styles.emptyDesc}>
                    Search a food, scan a barcode, or dictate a meal. Anything you log will show up here for one-tap re-logging.
                  </Text>
                </View>
              }
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />
          )}
        </>
      )}

      {/* ── MY MEALS tab ── */}
      {activeTab === 'mymeals' && (
        <>
          <View style={styles.mfpActionRow}>
            <TouchableOpacity
              style={styles.mfpActionCard}
              onPress={() => router.push({ pathname: '/nutrition/recipe-generator' as any, params: { asTemplate: '1' } })}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color={Colors.almostAquaDeep} />
              <Text style={styles.mfpActionLabel}>Create meal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mfpActionCard}
              onPress={() => router.push({ pathname: '/nutrition/copy-previous-meal' as any, params: { mealType: initialMealType } })}
              activeOpacity={0.8}
            >
              <Ionicons name="copy-outline" size={18} color={Colors.almostAquaDeep} />
              <Text style={styles.mfpActionLabel}>Copy previous meal</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={[...mealTemplates]
              .filter((t) => !query.trim() || t.name.toLowerCase().includes(query.toLowerCase()))
              .sort((a, b) => {
                // Most-recently-logged first; unlogged fall to createdAt
                const aKey = a.lastLoggedAt ?? a.createdAt;
                const bKey = b.lastLoggedAt ?? b.createdAt;
                return bKey.localeCompare(aKey);
              })}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isPrep = (item.totalServings ?? 1) > 1;
              const unitLabel = item.servingUnit ?? 'serving';
              const perServingCal = isPrep
                ? Math.round(item.totalCalories / (item.totalServings ?? 1))
                : item.totalCalories;
              // Food-safety badge (prep only, only if dateMade + protein provided)
              const safety = (() => {
                if (!isPrep || !item.dateMade || !item.primaryProtein) return null;
                const storage = item.storageMethod ?? 'fridge';
                const window = DEFAULT_SAFETY_WINDOWS[item.primaryProtein];
                return computeSafetyStatus(item.dateMade, item.primaryProtein, storage, window);
              })();
              const safetyLabel = safety ? statusBadge(safety.status) : null;
              return (
              <View style={styles.mealCard}>
                <TouchableOpacity
                  style={styles.mealCardMain}
                  onPress={() => {
                    if (isPrep) {
                      // Open serving picker for prep batches
                      setPrepPickerTemplate(item);
                      setPrepServingsInput('1');
                      return;
                    }
                    logMealTemplate(item.id, today(), initialMealType);
                    setLastLogged(`${item.name} — ${item.totalCalories} cal`);
                    flashSuccess();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.mealCardEmoji}>{item.emoji || (isPrep ? '🍱' : '🍽️')}</Text>
                  <View style={styles.mealCardInfo}>
                    <Text style={styles.mealCardName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.mealCardIngredients}>
                      {isPrep
                        ? `Meal prep · ${item.totalServings} ${unitLabel}${item.totalServings !== 1 ? 's' : ''}`
                        : `${item.foods.length} item${item.foods.length !== 1 ? 's' : ''}`}
                    </Text>
                    <Text style={styles.mealCardMacros}>
                      {isPrep
                        ? `~${perServingCal} cal per ${unitLabel}`
                        : `${item.totalCalories} cal · ${item.totalProteinGrams}p · ${item.totalCarbsGrams}c · ${item.totalFatGrams}f`}
                    </Text>
                    {safety && safetyLabel && (
                      <View style={[styles.safetyBadge, { borderColor: safetyLabel.color }]}>
                        <View style={[styles.safetyDot, { backgroundColor: safetyLabel.color }]} />
                        <Text style={[styles.safetyBadgeText, { color: safetyLabel.color }]}>
                          {safetyLabel.label}
                          {safety.status === 'fresh' && ` · ${safety.daysUntilExpiry}d left`}
                          {safety.status === 'freeze_soon' && ' · freeze soon'}
                          {safety.status === 'expiring' && safety.daysUntilExpiry >= 0 &&
                            (safety.daysUntilExpiry === 0 ? ' · today' : ` · ${safety.daysUntilExpiry}d left`)}
                          {safety.status === 'expired' && ' · throw out'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name="add-circle" size={28} color={Colors.almostAquaDeep} style={styles.recentAddBtn} />
                </TouchableOpacity>
                <View style={styles.mealCardActions}>
                  <TouchableOpacity
                    style={styles.mealActionBtn}
                    onPress={() => Alert.alert('Delete meal', `Remove "${item.name}"?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => removeMealTemplate(item.id) },
                    ])}
                  >
                    <Ionicons name="trash-outline" size={14} color={Colors.error + '88'} />
                    <Text style={[styles.mealActionText, { color: Colors.error + '88' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
              );
            }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={
              <View style={styles.emptyStateSoft}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="bookmark-outline" size={26} color={Colors.almostAquaDeep} />
                </View>
                <Text style={styles.emptyTitleBig}>Your routine,{'\n'}saved & ready.</Text>
                <Text style={styles.emptyDesc}>
                  Bundle the foods you eat together — your morning shake, your prep-day lunch — and drop them into any day with one tap.
                </Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />
        </>
      )}

      {/* ── MY RECIPES tab ── */}
      {activeTab === 'myrecipes' && (
        <>
          <View style={styles.mfpActionRow}>
            <TouchableOpacity
              style={styles.mfpActionCard}
              onPress={() => { setEditingMeal(null); setMealBuilderVisible(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color={Colors.almostAquaDeep} />
              <Text style={styles.mfpActionLabel}>Create recipe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mfpActionCard}
              onPress={() => router.push('/nutrition/recipe-generator')}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles-outline" size={18} color={Colors.almostAquaDeep} />
              <Text style={styles.mfpActionLabel}>Discover</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={customMeals.filter((m) => !query.trim() || m.name.toLowerCase().includes(query.toLowerCase()))}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.mealCard}>
                <TouchableOpacity style={styles.mealCardMain} onPress={() => handleLogCustomMeal(item)} activeOpacity={0.7}>
                  <Text style={styles.mealCardEmoji}>🍱</Text>
                  <View style={styles.mealCardInfo}>
                    <Text style={styles.mealCardName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.mealCardIngredients}>
                      {item.ingredients.length} ingredient{item.ingredients.length !== 1 ? 's' : ''} · {item.totalGrams}g total
                    </Text>
                    <Text style={styles.mealCardMacros}>
                      {item.totalCalories} cal · {item.totalProteinGrams}p · {item.totalCarbsGrams}c · {item.totalFatGrams}f
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={28} color={Colors.almostAquaDeep} style={styles.recentAddBtn} />
                </TouchableOpacity>
                <View style={styles.mealCardActions}>
                  <TouchableOpacity
                    style={styles.mealActionBtn}
                    onPress={() => { setEditingMeal(item); setMealBuilderVisible(true); }}
                  >
                    <Ionicons name="create-outline" size={14} color={Colors.darkTextSecondary} />
                    <Text style={styles.mealActionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.mealActionBtn}
                    onPress={() => Alert.alert('Delete recipe', `Remove "${item.name}"?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => removeCustomMeal(item.id) },
                    ])}
                  >
                    <Ionicons name="trash-outline" size={14} color={Colors.error + '88'} />
                    <Text style={[styles.mealActionText, { color: Colors.error + '88' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={
              <View style={styles.emptyStateSoft}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="reader-outline" size={26} color={Colors.almostAquaDeep} />
                </View>
                <Text style={styles.emptyTitleBig}>Build a recipe,{'\n'}skip the math.</Text>
                <Text style={styles.emptyDesc}>
                  Stack your ingredients once and PepTalk handles the macros every time you cook it.
                </Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />
        </>
      )}

      {/* ── MY FOODS tab ── */}
      {activeTab === 'myfoods' && (
        <>
          <View style={styles.mfpActionRow}>
            <TouchableOpacity
              style={styles.mfpActionCard}
              onPress={() => router.push('/nutrition/create-food' as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color={Colors.almostAquaDeep} />
              <Text style={styles.mfpActionLabel}>Create a food</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mfpActionCard}
              onPress={() => setCustomFoodVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="flash-outline" size={18} color={Colors.almostAquaDeep} />
              <Text style={styles.mfpActionLabel}>Quick add</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={customFoods.filter((f) => !query.trim() || f.name.toLowerCase().includes(query.toLowerCase()))}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.customFoodRow}
                onPress={() => handleCustomFoodItemPress(item)}
                activeOpacity={0.75}
              >
                <View style={[styles.foodEmojiBg, { backgroundColor: Colors.almostAquaDeep + '1A' }]}>
                  <Text style={styles.foodEmoji}>🥗</Text>
                </View>
                <View style={styles.foodInfo}>
                  <Text style={styles.foodName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.foodMacros}>
                    {item.servingSize} · {item.proteinGrams}p · {item.carbsGrams}c · {item.fatGrams}f
                  </Text>
                </View>
                <View style={styles.foodCalBadge}>
                  <Text style={styles.foodCalNum}>{item.calories}</Text>
                  <Text style={styles.foodCalLabel}>cal</Text>
                </View>
                <TouchableOpacity
                  onPress={() => Alert.alert('Delete food', `Remove "${item.name}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => removeCustomFood(item.id) },
                  ])}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ paddingLeft: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.error + '88'} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.emptyStateSoft}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="add-circle-outline" size={28} color={Colors.almostAquaDeep} />
                </View>
                <Text style={styles.emptyTitleBig}>Your kitchen,{'\n'}your database.</Text>
                <Text style={styles.emptyDesc}>
                  Homemade protein bars, that local smoothie spot, your gym's pre-workout — add it once and it's yours forever.
                </Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />
        </>
      )}

      {/* Portion Picker */}
      <PortionPickerModal
        food={selectedFood}
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onLog={handleLog}
        initialMealType={initialMealType}
      />

      {/* Barcode Scanner */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanned={handleBarcodeScanned}
      />

      {/* Custom Food Creator */}
      <CustomFoodModal
        visible={customFoodVisible}
        onClose={() => setCustomFoodVisible(false)}
        onSave={handleCustomFoodSaved}
      />

      {/* Meal Builder */}
      <MealBuilder
        visible={mealBuilderVisible}
        onClose={() => { setMealBuilderVisible(false); setEditingMeal(null); }}
        editMeal={editingMeal}
      />

      {/* Paywall modal for locked quick actions */}
      {paywallFeature && (
        <PaywallModal
          visible
          feature={paywallFeature}
          onDismiss={() => setPaywallFeature(null)}
        />
      )}

      {/* Meal-prep serving picker */}
      <Modal
        visible={prepPickerTemplate !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPrepPickerTemplate(null)}
      >
        <View style={styles.prepPickerOverlay}>
          <View style={styles.prepPickerCard}>
            {prepPickerTemplate && (() => {
              const total = prepPickerTemplate.totalServings ?? 1;
              const unit = prepPickerTemplate.servingUnit ?? 'serving';
              const servNum = Math.max(0, parseFloat(prepServingsInput) || 0);
              const ratio = total > 0 ? servNum / total : 0;
              const cal = Math.round(prepPickerTemplate.totalCalories * ratio);
              const pro = Math.round(prepPickerTemplate.totalProteinGrams * ratio);
              const carb = Math.round(prepPickerTemplate.totalCarbsGrams * ratio);
              const fat = Math.round(prepPickerTemplate.totalFatGrams * ratio);
              const quickOptions = [0.5, 1, 1.5, 2];
              const tooMany = servNum > total;
              return (
                <>
                  <Text style={styles.prepPickerTitle}>{prepPickerTemplate.name}</Text>
                  <Text style={styles.prepPickerSub}>
                    {total} {unit}{total !== 1 ? 's' : ''} made · how much are you having?
                  </Text>

                  <View style={styles.prepQuickRow}>
                    {quickOptions.map((o) => (
                      <TouchableOpacity
                        key={o}
                        style={[
                          styles.prepQuickChip,
                          parseFloat(prepServingsInput) === o && styles.prepQuickChipActive,
                        ]}
                        onPress={() => setPrepServingsInput(String(o))}
                      >
                        <Text
                          style={[
                            styles.prepQuickChipText,
                            parseFloat(prepServingsInput) === o && styles.prepQuickChipTextActive,
                          ]}
                        >
                          {o}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.prepPickerLabel}>Servings ({unit})</Text>
                  <TextInput
                    style={styles.prepPickerInput}
                    value={prepServingsInput}
                    onChangeText={setPrepServingsInput}
                    keyboardType="decimal-pad"
                    placeholder="1"
                    placeholderTextColor={Colors.darkTextSecondary}
                  />

                  <View style={styles.prepMacroPreview}>
                    <Text style={styles.prepMacroPreviewText}>
                      {cal} cal · {pro}p · {carb}c · {fat}f
                    </Text>
                  </View>

                  {tooMany && (
                    <Text style={styles.prepWarn}>
                      That's more than you made — confirm you want to log {servNum}.
                    </Text>
                  )}

                  <View style={styles.prepPickerActions}>
                    <TouchableOpacity
                      style={styles.prepPickerCancel}
                      onPress={() => setPrepPickerTemplate(null)}
                    >
                      <Text style={styles.prepPickerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.prepPickerLog,
                        (servNum <= 0) && { opacity: 0.4 },
                      ]}
                      disabled={servNum <= 0}
                      onPress={() => {
                        logMealTemplateServings(
                          prepPickerTemplate.id,
                          today(),
                          initialMealType,
                          servNum,
                        );
                        setLastLogged(
                          `${servNum} ${unit}${servNum !== 1 ? 's' : ''} of ${prepPickerTemplate.name} — ${cal} cal`,
                        );
                        setPrepPickerTemplate(null);
                        flashSuccess();
                      }}
                    >
                      <Ionicons name="add" size={16} color="#fff" />
                      <Text style={styles.prepPickerLogText}>Log</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5, color: '#2D2D2D' },

  // Search
  searchContainer: { paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.glassBlueBorder, paddingHorizontal: 14, height: 46,
  },
  searchInput: { flex: 1, fontSize: FontSizes.md, color: Colors.darkText },
  scanBtn: {
    width: 46, height: 46, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.almostAquaDeep, alignItems: 'center', justifyContent: 'center',
  },
  addCustomBtn: {
    width: 46, height: 46, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.pepBlue, alignItems: 'center', justifyContent: 'center',
  },

  // Custom food form
  customInput: {
    backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14, height: 48, fontSize: FontSizes.md,
    color: Colors.darkText, marginBottom: 8,
  },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customUnitLabel: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.darkTextSecondary, width: 20 },
  customMacroRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  customMacroLabel: { fontSize: FontSizes.md, color: Colors.darkText, fontWeight: '500' },
  customMacroInput: {
    width: 100, height: 44, backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14, fontSize: FontSizes.lg, fontWeight: '700',
    color: Colors.darkText, textAlign: 'right',
  },

  // Results header
  resultsHeader: { paddingHorizontal: Spacing.md, paddingVertical: 6 },
  resultsCount: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, fontStyle: 'italic' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
  clearBtnText: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary },

  // Recent food rows
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  recentImage: { width: 44, height: 44, borderRadius: 10 },
  recentInfo: { flex: 1 },
  recentName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText, marginBottom: 1 },
  recentBrand: { fontSize: FontSizes.xs, color: Colors.almostAquaDeep, marginBottom: 1 },
  recentMeta: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary },
  recentMacros: { fontSize: 10, color: Colors.darkTextSecondary, marginTop: 1 },
  recentAddBtn: { padding: 4 },

  // MFP-style 4-tab bar (underline indicator)
  mfpTabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    marginBottom: 4,
  },
  mfpTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  mfpTabText: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
    color: Colors.darkTextSecondary,
  },
  mfpTabTextActive: {
    color: Colors.darkText,
    fontFamily: 'DMSans-Bold',
  },
  mfpTabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: Colors.almostAquaDeep,
    borderRadius: 2,
  },

  // Quick action row (Barcode / Voice / Scan / Quick add)
  quickActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 8,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-SemiBold',
    color: Colors.almostAquaDeep,
  },
  quickActionLock: {
    position: 'absolute',
    top: -6,
    right: -10,
  },

  // Section label above list
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 10,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
    color: Colors.darkText,
    letterSpacing: 0.2,
  },
  clearLinkText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    color: Colors.darkTextSecondary,
  },

  // MFP-style action card row (Create meal / Copy previous meal, etc.)
  mfpActionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  mfpActionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.almostAquaDeep + '40',
    backgroundColor: Colors.almostAquaDeep + '0A',
  },
  mfpActionLabel: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
    color: Colors.almostAquaDeep,
  },

  // Soft empty state (matches MFP screenshots)
  emptyStateSoft: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
    gap: 10,
  },
  emptyStateEmoji: { fontSize: 52, marginBottom: 6 },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.almostAquaDeep + '14',
    borderWidth: 1,
    borderColor: Colors.almostAquaDeep + '33',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitleBig: {
    fontSize: 22,
    fontFamily: 'Playfair-Black',
    color: Colors.almostAquaDeep,
    textAlign: 'center',
    lineHeight: 28,
    letterSpacing: -0.3,
  },

  // Custom food row (My Foods tab)
  customFoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },

  // Legacy tab bar (kept for compatibility with any other references)
  tabBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md,
    marginBottom: 4, gap: 4,
  },
  tab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: Colors.glassWhite,
  },
  tabActive: { backgroundColor: Colors.almostAquaDeep },
  tabText: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.darkTextSecondary },
  tabTextActive: { color: '#fff' },
  newMealBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  newMealBtnText: { fontSize: FontSizes.xs, fontWeight: '700', color: Colors.almostAquaDeep },

  // My Meals cards
  mealCard: {
    backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.glassBlueBorder, overflow: 'hidden',
  },
  mealCardMain: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  mealCardEmoji: { fontSize: 28 },
  mealCardInfo: { flex: 1 },
  mealCardName: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.darkText, marginBottom: 2 },
  mealCardIngredients: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary },
  mealCardMacros: { fontSize: FontSizes.xs, color: Colors.almostAquaDeep, fontWeight: '600', marginTop: 2 },
  safetyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  safetyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  safetyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  mealCardActions: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)',
  },
  mealActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10,
  },
  mealActionText: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, fontWeight: '600' },

  // List
  listContent: { paddingHorizontal: Spacing.md, paddingBottom: 40 },
  separator: { height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginVertical: 1 },

  // Food row
  foodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  foodImage: { width: 44, height: 44, borderRadius: 10 },
  foodIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  foodEmojiBg: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  foodEmoji: { fontSize: 22 },
  foodInfo: { flex: 1 },
  foodName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText, marginBottom: 1 },
  foodBrand: { fontSize: FontSizes.xs, color: Colors.almostAquaDeep, marginBottom: 1 },
  foodMacros: { fontSize: 10, color: Colors.darkTextSecondary },
  foodCalBadge: { alignItems: 'center', marginRight: 4 },
  foodCalNum: { fontSize: FontSizes.md, fontWeight: '800', color: Colors.almostAquaDeep },
  foodCalLabel: { fontSize: 9, color: Colors.darkTextSecondary, marginTop: 1 },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.darkText },
  emptyDesc: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, textAlign: 'center', paddingHorizontal: Spacing.lg },

  // Success toast
  successToast: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.md, marginBottom: 8,
    backgroundColor: Colors.success + '22', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.success + '55',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  successText: { flex: 1, fontSize: FontSizes.sm, fontWeight: '600', color: Colors.success },

  // ── Modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingTop: 12, paddingBottom: 32,
    minHeight: '70%', maxHeight: '92%',
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.10)', alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  modalFoodTitle: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modalFoodImage: { width: 48, height: 48, borderRadius: 10, marginTop: 2 },
  modalEmoji: { fontSize: 36, marginTop: 2 },
  modalFoodName: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.darkText, marginBottom: 4 },
  brandText: { fontSize: FontSizes.sm, color: Colors.almostAquaDeep, fontWeight: '600', marginBottom: 4 },
  calPer100: { fontSize: 10, color: Colors.darkTextSecondary },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.glassWhite, alignItems: 'center', justifyContent: 'center' },

  // Form fields
  fieldLabel: {
    fontSize: FontSizes.xs, fontWeight: '700', color: Colors.darkTextSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 16,
  },

  // How much row: [qty] servings of [dropdown]
  howMuchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyInput: {
    width: 70, height: 52, backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.glassBlueBorder,
    fontSize: 22, fontWeight: '800', color: Colors.darkText, textAlign: 'center',
  },
  servingsOfText: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, fontWeight: '500' },
  servingDropdown: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 52, backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.glassBlueBorder, paddingHorizontal: 14, gap: 6,
  },
  servingDropdownText: { flex: 1, fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText },

  // Serving list (expanded picker)
  servingList: {
    backgroundColor: Colors.darkCard, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.glassBlueBorder,
    marginTop: 6, overflow: 'hidden', maxHeight: 280,
  },
  servingListItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)', gap: 8,
  },
  servingListItemActive: { backgroundColor: Colors.almostAquaDeep + '15' },
  servingListText: { flex: 1, fontSize: FontSizes.md, color: Colors.darkText, fontWeight: '500' },
  servingListGrams: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary },
  servingListTextActive: { color: Colors.almostAquaDeep, fontWeight: '700' },
  servingSectionHeader: {
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.03)', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  servingSectionText: {
    fontSize: 10, fontWeight: '700', color: Colors.darkTextSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  // Macro summary (compact, always visible)
  macroSummary: { alignItems: 'center', marginTop: 20, marginBottom: 8 },
  macroSummaryCalNum: { fontSize: 42, fontWeight: '900', color: Colors.darkText },
  macroSummaryCalLabel: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, fontWeight: '600', marginTop: -4 },
  macroPills: { flexDirection: 'row', gap: 12, marginTop: 12 },
  macroPill: {
    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: BorderRadius.md, borderWidth: 1, minWidth: 80,
    backgroundColor: Colors.glassWhite,
  },
  macroPillValue: { fontSize: FontSizes.md, fontWeight: '800' },
  macroPillLabel: { fontSize: 10, color: Colors.darkTextSecondary, fontWeight: '500', marginTop: 2 },
  weightSummary: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginTop: 8 },

  // Nutrition info toggle
  nutritionInfoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, marginTop: 4, marginBottom: 4,
  },
  nutritionInfoBtnText: { fontSize: FontSizes.sm, color: Colors.almostAquaDeep, fontWeight: '600' },

  // Nutrition label (FDA-style, collapsible)
  nutritionLabel: {
    backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.glassBlueBorder,
    padding: 16, marginBottom: 16,
  },
  nutritionTitle: { fontSize: FontSizes.lg, fontWeight: '900', color: Colors.darkText, marginBottom: 4 },
  nutritionServingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 2,
  },
  nutritionServingLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.darkText,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  nutritionServingValue: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.darkText,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  nutritionSeparatorThick: { height: 3, backgroundColor: Colors.darkText, marginVertical: 4 },
  nutritionSeparator: { height: 1, backgroundColor: 'rgba(0,0,0,0.10)', marginVertical: 2 },
  nutritionSeparatorThin: { height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 2 },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  nutritionRowLabel: { fontSize: FontSizes.md, color: Colors.darkText },
  nutritionRowLabelBold: { fontSize: FontSizes.md, fontWeight: '700', color: Colors.darkText },
  nutritionRowLabelIndent: { fontSize: FontSizes.sm, color: Colors.darkText, paddingLeft: 16 },
  nutritionRowValue: { fontSize: FontSizes.md, color: Colors.darkText, fontWeight: '600' },
  nutritionRowValueBig: { fontSize: FontSizes.xl, fontWeight: '900', color: Colors.darkText },

  // Meal type
  mealTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  mealTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.glassBlue, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.glassBlueBorder,
  },
  mealTypeChipActive: { backgroundColor: Colors.almostAquaDeep, borderColor: Colors.almostAquaDeep },
  mealTypeText: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, fontWeight: '500' },
  mealTypeTextActive: { color: '#fff', fontWeight: '700' },

  // Log button
  logBtnWrapper: { marginTop: 12 },

  // ── Barcode Scanner ──
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeaderAbsolute: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scannerHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: 12, paddingBottom: Spacing.sm,
  },
  scannerCloseBtn: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 22,
  },
  scannerTitle: { fontSize: FontSizes.xl, fontWeight: '800', color: '#fff' },
  scannerPermission: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: Spacing.xl,
  },
  scannerPermText: {
    fontSize: FontSizes.md, color: Colors.darkTextSecondary, textAlign: 'center', marginBottom: 8,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  scanCutout: {
    width: SCREEN_WIDTH * 0.7, height: SCREEN_WIDTH * 0.45,
    borderWidth: 2, borderColor: Colors.almostAquaDeep, borderRadius: 16,
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute', width: 24, height: 24,
    borderColor: Colors.almostAquaDeep, borderWidth: 3,
  },
  scanCornerTL: { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 14 },
  scanCornerTR: { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 14 },
  scanCornerBL: { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 14 },
  scanCornerBR: { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 14 },
  scanHint: {
    marginTop: 20, fontSize: FontSizes.md, fontWeight: '600', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  // Meal-prep serving picker
  prepPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  prepPickerCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: BorderRadius.lg,
    padding: 20,
  },
  prepPickerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '800',
    color: Colors.darkText,
    marginBottom: 2,
  },
  prepPickerSub: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    marginBottom: 16,
  },
  prepQuickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  prepQuickChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(127,179,194,0.3)',
    backgroundColor: 'rgba(127,179,194,0.06)',
    alignItems: 'center',
  },
  prepQuickChipActive: {
    backgroundColor: Colors.almostAquaDeep,
    borderColor: Colors.almostAquaDeep,
  },
  prepQuickChipText: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
  },
  prepQuickChipTextActive: {
    color: '#fff',
  },
  prepPickerLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.darkTextSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prepPickerInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.md,
    color: Colors.darkText,
    marginBottom: 14,
  },
  prepMacroPreview: {
    padding: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(127,179,194,0.1)',
    alignItems: 'center',
    marginBottom: 10,
  },
  prepMacroPreviewText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.darkText,
  },
  prepWarn: {
    fontSize: FontSizes.xs,
    color: Colors.warning,
    textAlign: 'center',
    marginBottom: 8,
  },
  prepPickerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  prepPickerCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
  },
  prepPickerCancelText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  prepPickerLog: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.almostAquaDeep,
  },
  prepPickerLogText: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: '#fff',
  },
});
