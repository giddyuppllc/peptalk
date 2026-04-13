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
import { useMealStore, type RecentFood, type CustomMeal } from '../../src/store/useMealStore';
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
  const [selectedServing, setSelectedServing] = useState(0);
  const [servingQty, setServingQty] = useState('1');
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [showServingPicker, setShowServingPicker] = useState(false);
  const [showNutritionInfo, setShowNutritionInfo] = useState(false);

  useEffect(() => {
    if (food) {
      setSelectedServing(0);
      setServingQty('1');
      setShowServingPicker(false);
      setShowNutritionInfo(false);
    }
  }, [food?.id]);

  let effectiveGrams = 0;
  if (food && food.servings[selectedServing]) {
    effectiveGrams = food.servings[selectedServing].grams * (parseFloat(servingQty) || 0);
  }
  const displayGrams = Math.round(effectiveGrams * 10) / 10;

  const macros = food
    ? calcUnifiedMacros(food, effectiveGrams)
    : { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fiberGrams: 0, sodiumMg: undefined as number | undefined, sugarGrams: undefined as number | undefined, cholesterolMg: undefined as number | undefined, saturatedFatGrams: undefined as number | undefined };

  if (!food) return null;

  const currentServing = food.servings[selectedServing];
  // Split servings into food-specific and universal weight units
  const foodServings = food.servings.filter((s) => !s.isUniversal);
  const weightServings = food.servings.filter((s) => s.isUniversal);

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
              {food.imageUrl ? (
                <Image source={{ uri: food.imageUrl }} style={styles.modalFoodImage} />
              ) : (
                <Text style={styles.modalEmoji}>{food.emoji || '🍽️'}</Text>
              )}
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
                      {active && <Ionicons name="checkmark" size={18} color={Colors.pepTeal} />}
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
                      {active && <Ionicons name="checkmark" size={18} color={Colors.pepTeal} />}
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
                  <View style={[styles.macroPill, { borderColor: Colors.pepTeal + '55' }]}>
                    <Text style={[styles.macroPillValue, { color: Colors.pepTeal }]}>{macros.proteinGrams}g</Text>
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
              <Ionicons name={showNutritionInfo ? 'list' : 'list-outline'} size={16} color={Colors.pepTeal} />
              <Text style={styles.nutritionInfoBtnText}>
                {showNutritionInfo ? 'Hide Nutrition Info' : 'Nutrition Info'}
              </Text>
              <Ionicons name={showNutritionInfo ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.pepTeal} />
            </TouchableOpacity>

            {showNutritionInfo && (
              <View style={styles.nutritionLabel}>
                <Text style={styles.nutritionTitle}>Nutrition Facts</Text>
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
        <View style={[styles.modalContent, { minHeight: '80%' }]}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <Text style={styles.modalFoodName}>Create Custom Food</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
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
        </View>
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
                <ActivityIndicator size="large" color={Colors.pepTeal} style={{ marginTop: 16 }} />
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
      {food.imageUrl ? (
        <Image source={{ uri: food.imageUrl }} style={styles.foodImage} />
      ) : (
        <View style={[styles.foodEmojiBg, { backgroundColor: Colors.pepTeal + '1A' }]}>
          <Text style={styles.foodEmoji}>{food.emoji || '🍽️'}</Text>
        </View>
      )}
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
  const { addMeal, updateMeal, meals, recentFoods, addRecentFood, clearRecentFoods, customMeals, removeCustomMeal } = useMealStore();

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
  const [activeTab, setActiveTab] = useState<'recent' | 'mymeals'>('recent');
  const [successVisible, setSuccessVisible] = useState(false);
  const [lastLogged, setLastLogged] = useState('');

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

    searchAllFoods(debouncedQuery).then((foods) => {
      if (!cancelled) {
        setResults(foods);
        setLoading(false);
      }
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
      setSuccessVisible(true);
      setTimeout(() => setSuccessVisible(false), 3000);
    },
    [addMeal, updateMeal, meals, params.mealId, addRecentFood],
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Food Search</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search bar + scan button */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <View style={[styles.searchBar, { flex: 1 }]}>
            <Ionicons name="search" size={18} color={Colors.darkTextSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search any food, brand, or restaurant..."
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
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => setScannerVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="barcode-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addCustomBtn}
            onPress={() => setCustomFoodVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search info or tabs */}
      {loading ? (
        <View style={styles.resultsHeader}>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.pepTeal} />
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
        /* Tabs: Recent | My Meals */
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'recent' && styles.tabActive]}
            onPress={() => setActiveTab('recent')}
          >
            <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>Recent</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'mymeals' && styles.tabActive]}
            onPress={() => setActiveTab('mymeals')}
          >
            <Text style={[styles.tabText, activeTab === 'mymeals' && styles.tabTextActive]}>My Meals</Text>
          </TouchableOpacity>
          {activeTab === 'recent' && recentFoods.length > 0 && (
            <TouchableOpacity onPress={clearRecentFoods} style={styles.clearBtn}>
              <Ionicons name="trash-outline" size={14} color={Colors.darkTextSecondary} />
            </TouchableOpacity>
          )}
          {activeTab === 'mymeals' && (
            <TouchableOpacity onPress={() => { setEditingMeal(null); setMealBuilderVisible(true); }} style={styles.newMealBtn}>
              <Ionicons name="add" size={16} color={Colors.pepTeal} />
              <Text style={styles.newMealBtnText}>New</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Success toast */}
      {successVisible && (
        <View style={styles.successToast}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
          <Text style={styles.successText}>Logged: {lastLogged}</Text>
        </View>
      )}

      {/* Search results OR recent foods */}
      {hasSearched ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FoodRow food={item} onPress={handleFoodPress} />
          )}
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
      ) : activeTab === 'recent' ? (
        /* ── Recent Foods Tab ── */
        <FlatList
          data={recentFoods}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.recentRow} onPress={() => handleRecentPress(item)} activeOpacity={0.7}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.recentImage} />
              ) : (
                <View style={[styles.foodEmojiBg, { backgroundColor: Colors.pepTeal + '1A' }]}>
                  <Text style={styles.foodEmoji}>{item.emoji || '🍽️'}</Text>
                </View>
              )}
              <View style={styles.recentInfo}>
                <Text style={styles.recentName} numberOfLines={1}>{item.foodName}</Text>
                {item.brand ? <Text style={styles.recentBrand} numberOfLines={1}>{item.brand}</Text> : null}
                <Text style={styles.recentMeta}>
                  {item.servingLabel} · {item.grams}g · {item.calories} cal
                </Text>
                <Text style={styles.recentMacros}>
                  {item.proteinGrams}p · {item.carbsGrams}c · {item.fatGrams}f
                </Text>
              </View>
              <TouchableOpacity
                style={styles.recentAddBtn}
                onPress={() => handleRecentPress(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="add-circle" size={28} color={Colors.pepTeal} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={40} color={Colors.darkTextSecondary} />
              <Text style={styles.emptyTitle}>No recent foods</Text>
              <Text style={styles.emptyDesc}>Foods you log will appear here for quick access</Text>
            </View>
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      ) : (
        /* ── My Meals Tab ── */
        <FlatList
          data={customMeals}
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
                <TouchableOpacity
                  style={styles.recentAddBtn}
                  onPress={() => handleLogCustomMeal(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="add-circle" size={28} color={Colors.pepTeal} />
                </TouchableOpacity>
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
                  onPress={() => Alert.alert('Delete Meal', `Remove "${item.name}"?`, [
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
            <View style={styles.emptyState}>
              <Ionicons name="restaurant-outline" size={40} color={Colors.darkTextSecondary} />
              <Text style={styles.emptyTitle}>No custom meals yet</Text>
              <Text style={styles.emptyDesc}>Tap "New" to build a meal from ingredients</Text>
            </View>
          }
          keyboardShouldPersistTaps="handled"
        />
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
    backgroundColor: Colors.pepTeal, alignItems: 'center', justifyContent: 'center',
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
  recentBrand: { fontSize: FontSizes.xs, color: Colors.pepTeal, marginBottom: 1 },
  recentMeta: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary },
  recentMacros: { fontSize: 10, color: Colors.darkTextSecondary, marginTop: 1 },
  recentAddBtn: { padding: 4 },

  // Tabs
  tabBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md,
    marginBottom: 4, gap: 4,
  },
  tab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: Colors.glassWhite,
  },
  tabActive: { backgroundColor: Colors.pepTeal },
  tabText: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.darkTextSecondary },
  tabTextActive: { color: '#fff' },
  newMealBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  newMealBtnText: { fontSize: FontSizes.xs, fontWeight: '700', color: Colors.pepTeal },

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
  mealCardMacros: { fontSize: FontSizes.xs, color: Colors.pepTeal, fontWeight: '600', marginTop: 2 },
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
  foodEmojiBg: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  foodEmoji: { fontSize: 22 },
  foodInfo: { flex: 1 },
  foodName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText, marginBottom: 1 },
  foodBrand: { fontSize: FontSizes.xs, color: Colors.pepTeal, marginBottom: 1 },
  foodMacros: { fontSize: 10, color: Colors.darkTextSecondary },
  foodCalBadge: { alignItems: 'center', marginRight: 4 },
  foodCalNum: { fontSize: FontSizes.md, fontWeight: '800', color: Colors.pepTeal },
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
  brandText: { fontSize: FontSizes.sm, color: Colors.pepTeal, fontWeight: '600', marginBottom: 4 },
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
  servingListItemActive: { backgroundColor: Colors.pepTeal + '15' },
  servingListText: { flex: 1, fontSize: FontSizes.md, color: Colors.darkText, fontWeight: '500' },
  servingListGrams: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary },
  servingListTextActive: { color: Colors.pepTeal, fontWeight: '700' },
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
  nutritionInfoBtnText: { fontSize: FontSizes.sm, color: Colors.pepTeal, fontWeight: '600' },

  // Nutrition label (FDA-style, collapsible)
  nutritionLabel: {
    backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.glassBlueBorder,
    padding: 16, marginBottom: 16,
  },
  nutritionTitle: { fontSize: FontSizes.lg, fontWeight: '900', color: Colors.darkText, marginBottom: 4 },
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
  mealTypeChipActive: { backgroundColor: Colors.pepTeal, borderColor: Colors.pepTeal },
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
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  scannerCloseBtn: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 22,
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
    borderWidth: 2, borderColor: Colors.pepTeal, borderRadius: 16,
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute', width: 24, height: 24,
    borderColor: Colors.pepTeal, borderWidth: 3,
  },
  scanCornerTL: { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 14 },
  scanCornerTR: { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 14 },
  scanCornerBL: { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 14 },
  scanCornerBR: { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 14 },
  scanHint: {
    marginTop: 20, fontSize: FontSizes.md, fontWeight: '600', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
});
