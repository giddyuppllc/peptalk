/**
 * AI Recipe Generator — generates personalized recipes based on macro targets.
 * Uses the OpenAI service already configured in the app.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useMealStore } from '../../src/store/useMealStore';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import { generateRecipe, isAIAvailable } from '../../src/services/llmService';
import { PaywallGate } from '../../src/hooks/useFeatureGate';

// ---------------------------------------------------------------------------
// Diet type options
// ---------------------------------------------------------------------------

const DIET_OPTIONS = [
  { key: 'any', label: 'Any Diet' },
  { key: 'keto', label: 'Keto' },
  { key: 'paleo', label: 'Paleo' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'high_protein', label: 'High Protein' },
  { key: 'low_carb', label: 'Low Carb' },
  { key: 'mediterranean', label: 'Mediterranean' },
];

const MEAL_TYPE_OPTIONS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
  { key: 'pre_workout', label: 'Pre-Workout' },
  { key: 'post_workout', label: 'Post-Workout' },
];

// ---------------------------------------------------------------------------
// Generated Recipe Card
// ---------------------------------------------------------------------------

interface GeneratedRecipe {
  name: string;
  description: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  ingredients: string[];
  instructions: string[];
  macros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

function RecipeCard({ recipe, onLog, mealType }: { recipe: GeneratedRecipe; onLog: (recipe: GeneratedRecipe) => void; mealType: string }) {
  const [expanded, setExpanded] = useState(false);
  const [logged, setLogged] = useState(false);

  return (
    <GlassCard>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setExpanded(!expanded)}
      >
        <View style={styles.recipeHeader}>
          <View style={styles.recipeIcon}>
            <Ionicons name="restaurant" size={20} color={Colors.almostAquaDeep} />
          </View>
          <View style={styles.recipeInfo}>
            <Text style={styles.recipeName}>{recipe.name}</Text>
            <Text style={styles.recipeDesc}>{recipe.description}</Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.darkTextSecondary}
          />
        </View>

        {/* Macro pills */}
        <View style={styles.macroPills}>
          <View style={[styles.macroPill, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
            <Text style={[styles.macroPillText, { color: Colors.almostAquaDeep }]}>
              {recipe.macros.calories} cal
            </Text>
          </View>
          <View style={[styles.macroPill, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
            <Text style={[styles.macroPillText, { color: Colors.almostAquaDeep }]}>
              {recipe.macros.protein}g protein
            </Text>
          </View>
          <View style={[styles.macroPill, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
            <Text style={[styles.macroPillText, { color: '#a855f7' }]}>
              {recipe.macros.carbs}g carbs
            </Text>
          </View>
          <View style={[styles.macroPill, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
            <Text style={[styles.macroPillText, { color: '#F4E9A7' }]}>
              {recipe.macros.fat}g fat
            </Text>
          </View>
        </View>

        <View style={styles.timePills}>
          <Ionicons name="time-outline" size={12} color={Colors.darkTextSecondary} />
          <Text style={styles.timeText}>
            Prep: {recipe.prepMinutes}min · Cook: {recipe.cookMinutes}min ·{' '}
            {recipe.servings} serving{recipe.servings > 1 ? 's' : ''}
          </Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.recipeExpanded}>
          {/* Ingredients */}
          <Text style={styles.recipeSubhead}>Ingredients</Text>
          {recipe.ingredients.map((ing, i) => (
            <View key={i} style={styles.ingredientRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.ingredientText}>{ing}</Text>
            </View>
          ))}

          {/* Instructions */}
          <Text style={[styles.recipeSubhead, { marginTop: 14 }]}>
            Instructions
          </Text>
          {recipe.instructions.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}

          {/* Log This Meal button */}
          <TouchableOpacity
            style={[styles.logMealBtn, logged && styles.logMealBtnDone]}
            onPress={() => {
              if (!logged) {
                onLog(recipe);
                setLogged(true);
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={logged ? 'checkmark-circle' : 'add-circle'}
              size={18}
              color={logged ? '#10b981' : '#fff'}
            />
            <Text style={[styles.logMealText, logged && { color: '#10b981' }]}>
              {logged ? 'Logged!' : 'Log This Meal'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function RecipeGeneratorScreen() {
  const router = useRouter();
  const { targets } = useMealStore();
  const { hasFeature } = useSubscriptionStore();
  const [diet, setDiet] = useState('any');
  const [mealType, setMealType] = useState('lunch');
  const [preferences, setPreferences] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<GeneratedRecipe[]>([]);

  const addMeal = useMealStore((s) => s.addMeal);
  const canUse = hasFeature('ai_recipe_generator');

  const handleLogRecipe = useCallback((recipe: GeneratedRecipe) => {
    const toDateKey = (d: Date) => {
      const y = d.getFullYear();
      const m = `${d.getMonth() + 1}`.padStart(2, '0');
      const dd = `${d.getDate()}`.padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };

    addMeal({
      id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: toDateKey(new Date()),
      mealType: mealType as any,
      foods: [],
      quickLog: {
        description: recipe.name,
        calories: recipe.macros.calories,
        proteinGrams: recipe.macros.protein,
        carbsGrams: recipe.macros.carbs,
        fatGrams: recipe.macros.fat,
      },
      notes: `AI-generated recipe: ${recipe.name}`,
      timestamp: new Date().toISOString(),
    });

    Alert.alert(
      'Meal Logged!',
      `${recipe.name} (${recipe.macros.calories} cal) added to today's nutrition.`,
    );
  }, [addMeal, mealType]);

  const FALLBACK_RECIPES: GeneratedRecipe[] = [
    {
      name: 'Grilled Chicken & Quinoa Power Bowl',
      description: 'High-protein bowl with grilled chicken, quinoa, roasted vegetables, and tahini dressing.',
      prepMinutes: 15, cookMinutes: 25, servings: 1,
      ingredients: ['6 oz chicken breast', '1/2 cup quinoa (dry)', '1 cup mixed vegetables', '1 tbsp olive oil', '1 tbsp tahini', '1 tsp lemon juice', 'Salt, pepper, garlic powder'],
      instructions: ['Cook quinoa. Set aside.', 'Season and grill chicken 6-7 min/side.', 'Roast vegetables at 400°F for 15-20 min.', 'Mix tahini with lemon juice for dressing.', 'Assemble bowl and enjoy!'],
      macros: { calories: 520, protein: 48, carbs: 42, fat: 16 },
    },
    {
      name: 'Protein Overnight Oats',
      description: 'Easy make-ahead breakfast packed with protein from Greek yogurt and protein powder.',
      prepMinutes: 5, cookMinutes: 0, servings: 1,
      ingredients: ['1/2 cup rolled oats', '1 scoop vanilla protein powder', '1/2 cup Greek yogurt', '1/2 cup almond milk', '1 tbsp chia seeds', '1/2 cup mixed berries'],
      instructions: ['Combine oats, protein powder, chia seeds.', 'Add yogurt and milk. Stir well.', 'Refrigerate overnight.', 'Top with berries and enjoy!'],
      macros: { calories: 410, protein: 38, carbs: 48, fat: 10 },
    },
    {
      name: 'Turkey Lettuce Wrap Tacos',
      description: 'Low-carb taco option using crisp lettuce cups with seasoned ground turkey.',
      prepMinutes: 10, cookMinutes: 15, servings: 2,
      ingredients: ['8 oz lean ground turkey', '1 tbsp taco seasoning', '8 butter lettuce leaves', '1/2 avocado', '1/4 cup salsa', '2 tbsp Greek yogurt'],
      instructions: ['Brown ground turkey.', 'Add taco seasoning and 2 tbsp water.', 'Spoon into lettuce cups.', 'Top with avocado, salsa, yogurt.'],
      macros: { calories: 340, protein: 32, carbs: 12, fat: 18 },
    },
  ];

  const handleGenerate = async () => {
    setLoading(true);
    try {
      if (isAIAvailable()) {
        const aiRecipes = await generateRecipe({
          diet,
          mealType,
          preferences,
          targets,
        });
        if (aiRecipes && aiRecipes.length > 0) {
          setRecipes(aiRecipes);
          setLoading(false);
          return;
        }
      }
      // Fallback to hardcoded recipes
      setRecipes(FALLBACK_RECIPES);
    } catch {
      setRecipes(FALLBACK_RECIPES);
    }
    setLoading(false);
  };

  return (
    <PaywallGate feature="recipe_generator">
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meals by Aimee</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Hero Image */}
        <View style={styles.section}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80' }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <LinearGradient
            colors={[Colors.almostAquaDeep, Colors.pepCyan]}
            style={styles.introIcon}
          >
            <Ionicons name="sparkles" size={28} color="#fff" />
          </LinearGradient>
          <Text style={styles.introTitle}>Meals by Aimee</Text>
          <Text style={styles.introDesc}>
            Get personalized meal ideas from Aimee based on your macro targets,
            dietary preferences, and available ingredients.
          </Text>
        </View>

        {/* Current targets summary */}
        <View style={styles.section}>
          <GlassCard>
            <Text style={styles.targetLabel}>Your Daily Targets</Text>
            <View style={styles.targetRow}>
              <Text style={styles.targetVal}>
                {targets.calories} cal
              </Text>
              <Text style={styles.targetSep}>·</Text>
              <Text style={styles.targetVal}>
                {targets.proteinGrams}g protein
              </Text>
              <Text style={styles.targetSep}>·</Text>
              <Text style={styles.targetVal}>
                {targets.carbsGrams}g carbs
              </Text>
              <Text style={styles.targetSep}>·</Text>
              <Text style={styles.targetVal}>{targets.fatGrams}g fat</Text>
            </View>
          </GlassCard>
        </View>

        {/* Diet filter */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diet Preference</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {DIET_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.chip,
                    diet === opt.key && styles.chipActive,
                  ]}
                  onPress={() => setDiet(opt.key)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      diet === opt.key && styles.chipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Meal type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meal Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {MEAL_TYPE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.chip,
                    mealType === opt.key && styles.chipActive,
                  ]}
                  onPress={() => setMealType(opt.key)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      mealType === opt.key && styles.chipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Extra preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Additional Preferences (optional)
          </Text>
          <TextInput
            style={styles.prefInput}
            value={preferences}
            onChangeText={setPreferences}
            placeholder="e.g. No dairy, under 30 min, meal prep friendly"
            placeholderTextColor={Colors.darkTextSecondary}
            multiline
          />
        </View>

        {/* Generate button */}
        <View style={styles.section}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.almostAquaDeep} />
              <Text style={styles.loadingText}>
                Generating personalized recipes...
              </Text>
            </View>
          ) : (
            <GradientButton
              label="Generate Recipes"
              onPress={handleGenerate}
              colors={[Colors.almostAquaDeep, Colors.pepCyan]}
            />
          )}
        </View>

        {/* Results */}
        {recipes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Recipes</Text>
            {recipes.map((recipe, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <RecipeCard recipe={recipe} onLog={handleLogRecipe} mealType={mealType} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
    </PaywallGate>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.darkText,
  },
  scroll: { paddingBottom: 40 },

  // Hero image
  heroImage: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    marginBottom: 16,
    opacity: 0.8,
  },

  // Intro
  intro: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  introIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  introTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.darkText,
  },
  introDesc: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // Sections
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: 8,
  },

  // Targets
  targetLabel: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginBottom: 6,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  targetVal: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.almostAquaDeep,
  },
  targetSep: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
  },

  // Chips
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    backgroundColor: Colors.glassBlue,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
  },
  chipActive: {
    backgroundColor: Colors.almostAquaDeep,
    borderColor: Colors.almostAquaDeep,
  },
  chipText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // Preferences input
  prefInput: {
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: FontSizes.sm,
    color: Colors.darkText,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    fontWeight: '500',
  },

  // Recipe card
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  recipeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeInfo: { flex: 1 },
  recipeName: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.darkText,
  },
  recipeDesc: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  macroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  macroPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  macroPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timePills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },

  // Expanded recipe
  recipeExpanded: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  recipeSubhead: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.almostAquaDeep,
    marginTop: 6,
  },
  ingredientText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 18,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.almostAquaDeep,
  },
  stepText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 20,
  },

  // Log meal button
  logMealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.almostAquaDeep,
  },
  logMealBtnDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  logMealText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: '#fff',
  },
});
