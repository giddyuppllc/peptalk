/**
 * Voice Log — natural-language food logging.
 *
 * Route: /nutrition/voice-log
 * Params: mealType (target meal type, defaults to inferred-from-time)
 *
 * Flow:
 *   1. User dictates or types what they ate (iOS keyboard has built-in mic)
 *   2. searchAllFoods() parses the phrase via CalorieNinjas natural-language API
 *   3. App shows matched foods with checkboxes
 *   4. User confirms → all checked items log into the meal store
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { PaywallGate } from '../../src/hooks/useFeatureGate';
import { Spacing, BorderRadius } from '../../src/constants/theme';
import { searchAllFoods, calcUnifiedMacros, type UnifiedFood } from '../../src/services/foodSearchService';
import { useMealStore } from '../../src/store/useMealStore';
import type { MealType } from '../../src/types/fitness';

const today = () => new Date().toISOString().slice(0, 10);

const inferMealType = (): MealType => {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snack';
  return 'dinner';
};

const SAMPLE_PROMPTS = [
  '2 eggs and a piece of toast',
  '1 cup oatmeal with banana and honey',
  'grilled chicken salad with ranch',
  'turkey sandwich and an apple',
];

export default function VoiceLogScreenWrapper() {
  return (
    <PaywallGate feature="voice_log">
      <VoiceLogScreen />
    </PaywallGate>
  );
}

function VoiceLogScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();
  const { mealType: paramMealType } = useLocalSearchParams<{ mealType?: MealType }>();
  const addMeal = useMealStore((state) => state.addMeal);

  const [text, setText] = useState('');
  const [mealType, setMealType] = useState<MealType>(paramMealType ?? inferMealType());
  const [parsing, setParsing] = useState(false);
  const [results, setResults] = useState<UnifiedFood[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const handleParse = async () => {
    if (!text.trim()) {
      Alert.alert('Empty', 'Type or dictate what you ate first.');
      return;
    }
    setParsing(true);
    setResults([]);
    setSelected({});
    try {
      const foods = await searchAllFoods(text, { limit: 12 });
      setResults(foods);
      // Pre-select first 5 results
      const initial: Record<string, boolean> = {};
      foods.slice(0, 5).forEach((f) => { initial[f.id] = true; });
      setSelected(initial);
    } catch (err) {
      Alert.alert('Could not parse', 'Try rephrasing what you ate, or use the regular search instead.');
    } finally {
      setParsing(false);
    }
  };

  const handleLogAll = () => {
    const toLog = results.filter((f) => selected[f.id]);
    if (toLog.length === 0) {
      Alert.alert('Nothing selected', 'Tap items above to include them.');
      return;
    }

    const dateKey = today();
    const foods = toLog.map((food) => {
      const grams = food.defaultServingGrams || 100;
      const macros = calcUnifiedMacros(food, grams);
      return {
        foodId: food.id,
        foodName: `${food.name}${food.brand ? ` (${food.brand})` : ''} — ${grams}g`,
        servings: 1,
        calories: macros.calories,
        proteinGrams: macros.proteinGrams,
        carbsGrams: macros.carbsGrams,
        fatGrams: macros.fatGrams,
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
    });

    addMeal({
      id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: dateKey,
      mealType,
      foods,
      notes: `Voice: "${text.trim()}"`,
      timestamp: new Date().toISOString(),
    });

    router.back();
  };

  const totalCal = results.filter((f) => selected[f.id]).reduce((sum, f) => {
    const grams = f.defaultServingGrams || 100;
    return sum + calcUnifiedMacros(f, grams).calories;
  }, 0);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]}>Voice Log</Text>
        <View style={s.iconBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero prompt */}
          <View style={s.hero}>
            <View style={[s.micCircle, { backgroundColor: `${accent.deep}18` }]}>
              <Ionicons name="mic" size={28} color={accent.deep} />
            </View>
            <Text style={[s.heroTitle, { color: t.text }]}>What did you eat?</Text>
            <Text style={[s.heroSub, { color: t.textSecondary }]}>
              Tap the mic on your keyboard to dictate, or type it out.
            </Text>
          </View>

          {/* Input */}
          <View style={[s.inputCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
            <TextInput
              style={[s.textArea, { color: t.text }]}
              placeholder="ex. 2 eggs scrambled, a slice of sourdough toast, and a banana"
              placeholderTextColor={t.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Sample prompts */}
          {results.length === 0 && !parsing && (
            <>
              <Text style={[s.sectionLabel, { color: t.textSecondary }]}>TRY SAYING</Text>
              {SAMPLE_PROMPTS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[s.sampleChip, { backgroundColor: t.surface, borderColor: t.cardBorder }]}
                  onPress={() => setText(p)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={t.textMuted} />
                  <Text style={[s.sampleText, { color: t.text }]}>"{p}"</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Parse button */}
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: accent.deep }, parsing && { opacity: 0.6 }]}
            onPress={handleParse}
            disabled={parsing}
            activeOpacity={0.85}
          >
            {parsing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={s.primaryBtnText}>Parse meal</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Results */}
          {results.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: t.textSecondary }]}>
                MATCHED FOODS — TAP TO TOGGLE
              </Text>
              {results.map((food) => {
                const checked = !!selected[food.id];
                const grams = food.defaultServingGrams || 100;
                const cal = calcUnifiedMacros(food, grams).calories;
                return (
                  <TouchableOpacity
                    key={food.id}
                    style={[
                      s.matchRow,
                      { backgroundColor: t.surface, borderColor: t.cardBorder },
                      checked && { borderColor: accent.deep, backgroundColor: `${accent.deep}0A` },
                    ]}
                    onPress={() => setSelected({ ...selected, [food.id]: !checked })}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        s.checkbox,
                        { borderColor: t.cardBorder },
                        checked && { backgroundColor: accent.deep, borderColor: accent.deep },
                      ]}
                    >
                      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.matchName, { color: t.text }]} numberOfLines={1}>
                        {food.name}
                      </Text>
                      {food.brand && (
                        <Text style={[s.matchBrand, { color: accent.deep }]} numberOfLines={1}>
                          {food.brand}
                        </Text>
                      )}
                      <Text style={[s.matchMeta, { color: t.textSecondary }]}>
                        {grams}g · {cal} cal
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Confirm button */}
              <View style={s.confirmBar}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.confirmCount, { color: t.textSecondary }]}>
                    {Object.values(selected).filter(Boolean).length} item
                    {Object.values(selected).filter(Boolean).length !== 1 ? 's' : ''}
                  </Text>
                  <Text style={[s.confirmCal, { color: t.text }]}>
                    {Math.round(totalCal)} cal total
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.confirmBtn, { backgroundColor: accent.deep }]}
                  onPress={handleLogAll}
                  activeOpacity={0.85}
                >
                  <Text style={s.confirmBtnText}>Log meal</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  micCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.4,
  },
  heroSub: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
  },
  inputCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
    minHeight: 110,
  },
  textArea: {
    fontSize: 15,
    fontFamily: 'DMSans-Regular',
    minHeight: 90,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 4,
  },
  sampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: 6,
  },
  sampleText: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    flex: 1,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
    marginTop: 16,
  },
  primaryBtnText: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchName: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  matchBrand: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    marginTop: 1,
  },
  matchMeta: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  confirmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  confirmCount: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
  },
  confirmCal: {
    fontSize: 18,
    fontFamily: 'Playfair-Black',
    marginTop: 1,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
  },
  confirmBtnText: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
