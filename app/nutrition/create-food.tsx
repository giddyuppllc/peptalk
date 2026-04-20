/**
 * Create Custom Food — full nutrition entry form (MFP-style).
 *
 * Route: /nutrition/create-food
 *
 * Saves a FoodItem into useMealStore.customFoods, then routes back so the
 * user can find it under the My Foods tab in food-search.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { Spacing, BorderRadius } from '../../src/constants/theme';
import { useMealStore } from '../../src/store/useMealStore';
import { useFeatureLimit } from '../../src/hooks/useFeatureLimit';
import { PaywallModal } from '../../src/components/PaywallModal';

interface FieldRowProps {
  label: string;
  required?: boolean;
  value: string;
  placeholder: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  unit?: string;
}

function FieldRow({ label, required, value, placeholder, onChangeText, keyboardType = 'default', unit }: FieldRowProps) {
  const t = useTheme();
  const accent = useSectionAccent();
  return (
    <View style={[s.row, { borderBottomColor: t.cardBorder }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, { color: t.text }]}>{label}</Text>
        {required && <Text style={[s.rowRequired, { color: t.textMuted }]}>Required</Text>}
        {!required && <Text style={[s.rowRequired, { color: t.textMuted }]}>Optional</Text>}
      </View>
      <View style={s.rowInputWrap}>
        <TextInput
          style={[s.rowInput, { color: t.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.textMuted}
          keyboardType={keyboardType}
          textAlign="right"
        />
        {unit ? <Text style={[s.rowUnit, { color: t.textSecondary }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const FREE_CUSTOM_FOOD_LIMIT = 3;

export default function CreateFoodScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();
  const addCustomFood = useMealStore((state) => state.addCustomFood);
  const customFoods = useMealStore((state) => state.customFoods);
  const { isOverLimit } = useFeatureLimit('custom_foods_unlimited', customFoods.length, FREE_CUSTOM_FOOD_LIMIT);
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Section 1 — Identification
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [servingsPerContainer, setServingsPerContainer] = useState('1');

  // Section 2 — Macros (per serving)
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [sugar, setSugar] = useState('');
  const [sodium, setSodium] = useState('');
  const [cholesterol, setCholesterol] = useState('');
  const [saturatedFat, setSaturatedFat] = useState('');

  const [showOptional, setShowOptional] = useState(false);

  const handleSave = () => {
    if (isOverLimit) {
      setPaywallVisible(true);
      return;
    }
    if (!description.trim()) {
      Alert.alert('Missing description', 'Please enter a food description.');
      return;
    }
    if (!servingSize.trim()) {
      Alert.alert('Missing serving size', 'Please enter the serving size (e.g. "1 cup", "100g").');
      return;
    }
    const cals = parseFloat(calories) || 0;
    if (cals <= 0) {
      Alert.alert('Missing calories', 'Please enter the calories per serving.');
      return;
    }

    // Try to parse grams from the serving size string (e.g. "1 cup (240g)" → 240)
    const gramsMatch = servingSize.match(/(\d+(?:\.\d+)?)\s*g/i);
    const servingGrams = gramsMatch ? parseFloat(gramsMatch[1]) : 100;

    const fullName = brand.trim() ? `${brand.trim()} — ${description.trim()}` : description.trim();

    addCustomFood({
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: fullName,
      servingSize: servingSize.trim(),
      servingGrams,
      calories: cals,
      proteinGrams: parseFloat(protein) || 0,
      carbsGrams: parseFloat(carbs) || 0,
      fatGrams: parseFloat(fat) || 0,
      fiberGrams: parseFloat(fiber) || 0,
      isCustom: true,
    });

    router.back();
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]}>Create Food</Text>
        <TouchableOpacity onPress={handleSave} style={s.iconBtn}>
          <Ionicons name="checkmark" size={24} color={accent.deep} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Section: Identification */}
          <Text style={[s.sectionLabel, { color: t.textSecondary }]}>FOOD INFO</Text>
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
            <FieldRow label="Brand Name" value={brand} placeholder="ex. Campbell's" onChangeText={setBrand} />
            <FieldRow label="Description" required value={description} placeholder="ex. Chicken Soup" onChangeText={setDescription} />
            <FieldRow label="Serving Size" required value={servingSize} placeholder="ex. 1 cup" onChangeText={setServingSize} />
            <FieldRow label="Servings per container" required value={servingsPerContainer} placeholder="1" onChangeText={setServingsPerContainer} keyboardType="decimal-pad" />
          </View>

          {/* Section: Macros */}
          <Text style={[s.sectionLabel, { color: t.textSecondary }]}>NUTRITION (PER SERVING)</Text>
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
            <FieldRow label="Calories" required value={calories} placeholder="0" onChangeText={setCalories} keyboardType="decimal-pad" unit="kcal" />
            <FieldRow label="Protein" value={protein} placeholder="0" onChangeText={setProtein} keyboardType="decimal-pad" unit="g" />
            <FieldRow label="Carbs" value={carbs} placeholder="0" onChangeText={setCarbs} keyboardType="decimal-pad" unit="g" />
            <FieldRow label="Fat" value={fat} placeholder="0" onChangeText={setFat} keyboardType="decimal-pad" unit="g" />
          </View>

          {/* Optional Micros */}
          <TouchableOpacity
            style={[s.expandBtn, { borderColor: t.cardBorder }]}
            onPress={() => setShowOptional(!showOptional)}
            activeOpacity={0.7}
          >
            <Text style={[s.expandBtnText, { color: accent.deep }]}>
              {showOptional ? 'Hide' : 'Show'} additional nutrients
            </Text>
            <Ionicons
              name={showOptional ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={accent.deep}
            />
          </TouchableOpacity>

          {showOptional && (
            <View style={[s.card, { backgroundColor: t.surface, borderColor: t.cardBorder, marginTop: 0 }]}>
              <FieldRow label="Fiber" value={fiber} placeholder="0" onChangeText={setFiber} keyboardType="decimal-pad" unit="g" />
              <FieldRow label="Sugar" value={sugar} placeholder="0" onChangeText={setSugar} keyboardType="decimal-pad" unit="g" />
              <FieldRow label="Sodium" value={sodium} placeholder="0" onChangeText={setSodium} keyboardType="decimal-pad" unit="mg" />
              <FieldRow label="Cholesterol" value={cholesterol} placeholder="0" onChangeText={setCholesterol} keyboardType="decimal-pad" unit="mg" />
              <FieldRow label="Saturated Fat" value={saturatedFat} placeholder="0" onChangeText={setSaturatedFat} keyboardType="decimal-pad" unit="g" />
            </View>
          )}

          <View style={{ height: 24 }} />

          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: accent.deep }]}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            <Text style={s.saveBtnText}>Save Food</Text>
          </TouchableOpacity>

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <PaywallModal
        visible={paywallVisible}
        feature="custom_foods_unlimited"
        onDismiss={() => setPaywallVisible(false)}
      />
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
    fontSize: 18,
    fontFamily: 'DMSans-Bold',
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    minHeight: 58,
  },
  rowLabel: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  rowRequired: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  rowInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 110,
    justifyContent: 'flex-end',
  },
  rowInput: {
    fontSize: 15,
    fontFamily: 'DMSans-Medium',
    padding: 0,
    minWidth: 60,
    textAlign: 'right',
  },
  rowUnit: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 12,
  },
  expandBtnText: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
