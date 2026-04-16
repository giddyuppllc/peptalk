/**
 * Meal Builder — Create custom meals/recipes from database foods.
 *
 * Features:
 * - Search and add ingredients from all food sources
 * - Set weight per ingredient
 * - Auto-calculate total macros
 * - Save as reusable custom meal
 * - Edit existing meals
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from './GradientButton';
import { Colors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useMealStore, type CustomMeal, type CustomMealIngredient } from '../store/useMealStore';
import { searchAllFoods, calcUnifiedMacros, type UnifiedFood } from '../services/foodSearchService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MealBuilderProps {
  visible: boolean;
  onClose: () => void;
  /** If provided, editing an existing meal */
  editMeal?: CustomMeal | null;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MealBuilder({ visible, onClose, editMeal }: MealBuilderProps) {
  const { addCustomMeal, updateCustomMeal } = useMealStore();

  const [mealName, setMealName] = useState('');
  const [ingredients, setIngredients] = useState<CustomMealIngredient[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedFood[]>([]);
  const [searching, setSearching] = useState(false);
  // Weight input for a food being added
  const [addingFood, setAddingFood] = useState<UnifiedFood | null>(null);
  const [addingGrams, setAddingGrams] = useState('100');

  const debouncedQuery = useDebounce(searchQuery, 400);

  // Seed form when editing
  useEffect(() => {
    if (visible && editMeal) {
      setMealName(editMeal.name);
      setIngredients(editMeal.ingredients);
    } else if (visible) {
      setMealName('');
      setIngredients([]);
    }
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setAddingFood(null);
  }, [visible, editMeal?.id]);

  // Search
  useEffect(() => {
    if (!debouncedQuery.trim()) { setSearchResults([]); return; }
    let cancelled = false;
    setSearching(true);
    searchAllFoods(debouncedQuery, { limit: 10 }).then((foods) => {
      if (!cancelled) { setSearchResults(foods); setSearching(false); }
    });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  // Calculate totals
  const totalGrams = ingredients.reduce((s, i) => s + i.grams, 0);
  const totalCalories = ingredients.reduce((s, i) => s + Math.round(i.per100g.calories * i.grams / 100), 0);
  const totalProtein = ingredients.reduce((s, i) => s + Math.round(i.per100g.proteinGrams * i.grams / 100 * 10) / 10, 0);
  const totalCarbs = ingredients.reduce((s, i) => s + Math.round(i.per100g.carbsGrams * i.grams / 100 * 10) / 10, 0);
  const totalFat = ingredients.reduce((s, i) => s + Math.round(i.per100g.fatGrams * i.grams / 100 * 10) / 10, 0);
  const totalFiber = ingredients.reduce((s, i) => s + Math.round(i.per100g.fiberGrams * i.grams / 100 * 10) / 10, 0);

  const handleAddIngredient = useCallback(() => {
    if (!addingFood) return;
    const grams = parseFloat(addingGrams) || 0;
    if (grams <= 0) { Alert.alert('Enter Weight', 'Please enter the weight in grams.'); return; }

    const ingredient: CustomMealIngredient = {
      foodId: addingFood.id,
      foodName: addingFood.name,
      brand: addingFood.brand,
      grams,
      per100g: {
        calories: addingFood.per100g.calories,
        proteinGrams: addingFood.per100g.proteinGrams,
        carbsGrams: addingFood.per100g.carbsGrams,
        fatGrams: addingFood.per100g.fatGrams,
        fiberGrams: addingFood.per100g.fiberGrams,
      },
      imageUrl: addingFood.imageUrl,
      emoji: addingFood.emoji,
    };

    setIngredients((prev) => [...prev, ingredient]);
    setAddingFood(null);
    setAddingGrams('100');
    setShowSearch(false);
    setSearchQuery('');
  }, [addingFood, addingGrams]);

  const handleRemoveIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateIngredientWeight = (index: number, grams: string) => {
    setIngredients((prev) =>
      prev.map((ing, i) => i === index ? { ...ing, grams: parseFloat(grams) || 0 } : ing),
    );
  };

  const handleSave = () => {
    if (!mealName.trim()) { Alert.alert('Name Required', 'Please enter a meal name.'); return; }
    if (ingredients.length === 0) { Alert.alert('Add Ingredients', 'Please add at least one ingredient.'); return; }

    const meal: CustomMeal = {
      id: editMeal?.id || `custom-meal-${Date.now()}`,
      name: mealName.trim(),
      ingredients,
      totalGrams: Math.round(totalGrams),
      totalCalories: Math.round(totalCalories),
      totalProteinGrams: Math.round(totalProtein * 10) / 10,
      totalCarbsGrams: Math.round(totalCarbs * 10) / 10,
      totalFatGrams: Math.round(totalFat * 10) / 10,
      totalFiberGrams: Math.round(totalFiber * 10) / 10,
      createdAt: editMeal?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (editMeal) {
      updateCustomMeal(editMeal.id, meal);
    } else {
      addCustomMeal(meal);
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.container}>
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>{editMeal ? 'Edit Meal' : 'Create Custom Meal'}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.darkText} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
            {/* Meal Name */}
            <Text style={s.label}>Meal Name</Text>
            <TextInput
              style={s.input}
              value={mealName}
              onChangeText={setMealName}
              placeholder="e.g. Chicken Salad, Meal Prep Bowl"
              placeholderTextColor={Colors.darkTextSecondary}
            />

            {/* Ingredients List */}
            <View style={s.ingredientsHeader}>
              <Text style={s.label}>Ingredients ({ingredients.length})</Text>
              <TouchableOpacity style={s.addIngredientBtn} onPress={() => setShowSearch(true)}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={s.addIngredientText}>Add Food</Text>
              </TouchableOpacity>
            </View>

            {ingredients.length === 0 ? (
              <View style={s.emptyIngredients}>
                <Ionicons name="restaurant-outline" size={32} color={Colors.darkTextSecondary} />
                <Text style={s.emptyText}>No ingredients yet</Text>
                <Text style={s.emptySubtext}>Tap "Add Food" to search and add ingredients</Text>
              </View>
            ) : (
              ingredients.map((ing, idx) => {
                const ingCal = Math.round(ing.per100g.calories * ing.grams / 100);
                const ingPro = Math.round(ing.per100g.proteinGrams * ing.grams / 100 * 10) / 10;
                return (
                  <View key={`${ing.foodId}-${idx}`} style={s.ingredientRow}>
                    {ing.imageUrl ? (
                      <Image source={{ uri: ing.imageUrl }} style={s.ingredientImage} />
                    ) : (
                      <Text style={s.ingredientEmoji}>{ing.emoji || '🍽️'}</Text>
                    )}
                    <View style={s.ingredientInfo}>
                      <Text style={s.ingredientName} numberOfLines={1}>{ing.foodName}</Text>
                      {ing.brand && <Text style={s.ingredientBrand}>{ing.brand}</Text>}
                      <Text style={s.ingredientMacro}>{ingCal} cal · {ingPro}g protein</Text>
                    </View>
                    <TextInput
                      style={s.ingredientWeight}
                      value={String(ing.grams)}
                      onChangeText={(v) => handleUpdateIngredientWeight(idx, v)}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                    />
                    <Text style={s.gramLabel}>g</Text>
                    <TouchableOpacity onPress={() => handleRemoveIngredient(idx)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="close-circle" size={22} color={Colors.error + '88'} />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}

            {/* Totals */}
            {ingredients.length > 0 && (
              <View style={s.totalsCard}>
                <Text style={s.totalsTitle}>Recipe Totals — {Math.round(totalGrams)}g</Text>
                <View style={s.totalsRow}>
                  <View style={s.totalItem}>
                    <Text style={[s.totalValue, { color: Colors.almostAquaDeep }]}>{Math.round(totalCalories)}</Text>
                    <Text style={s.totalLabel}>Cal</Text>
                  </View>
                  <View style={s.totalDivider} />
                  <View style={s.totalItem}>
                    <Text style={[s.totalValue, { color: Colors.almostAquaDeep }]}>{Math.round(totalProtein * 10) / 10}g</Text>
                    <Text style={s.totalLabel}>Protein</Text>
                  </View>
                  <View style={s.totalDivider} />
                  <View style={s.totalItem}>
                    <Text style={[s.totalValue, { color: Colors.pepBlue }]}>{Math.round(totalCarbs * 10) / 10}g</Text>
                    <Text style={s.totalLabel}>Carbs</Text>
                  </View>
                  <View style={s.totalDivider} />
                  <View style={s.totalItem}>
                    <Text style={[s.totalValue, { color: '#a855f7' }]}>{Math.round(totalFat * 10) / 10}g</Text>
                    <Text style={s.totalLabel}>Fat</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Save button */}
          <View style={{ marginTop: 12 }}>
            <GradientButton
              label={editMeal ? 'Save Changes' : 'Save Meal'}
              onPress={handleSave}
              disabled={ingredients.length === 0 || !mealName.trim()}
            />
          </View>

          {/* ── Ingredient Search Overlay ── */}
          {showSearch && (
            <View style={s.searchOverlay}>
              {/* Adding weight step */}
              {addingFood ? (
                <View style={s.searchContent}>
                  <View style={s.searchHeader}>
                    <TouchableOpacity onPress={() => setAddingFood(null)}>
                      <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
                    </TouchableOpacity>
                    <Text style={s.searchTitle}>Set Amount</Text>
                    <View style={{ width: 24 }} />
                  </View>
                  <View style={s.addingFoodCard}>
                    {addingFood.imageUrl ? (
                      <Image source={{ uri: addingFood.imageUrl }} style={s.addingFoodImage} />
                    ) : (
                      <Text style={{ fontSize: 32 }}>{addingFood.emoji || '🍽️'}</Text>
                    )}
                    <Text style={s.addingFoodName} numberOfLines={2}>{addingFood.name}</Text>
                    {addingFood.brand && <Text style={s.addingFoodBrand}>{addingFood.brand}</Text>}
                  </View>
                  <Text style={s.label}>Weight (grams)</Text>
                  <TextInput
                    style={[s.input, { fontSize: 24, fontWeight: '800', textAlign: 'center' }]}
                    value={addingGrams}
                    onChangeText={setAddingGrams}
                    keyboardType="decimal-pad"
                    placeholder="100"
                    placeholderTextColor={Colors.darkTextSecondary}
                    autoFocus
                    selectTextOnFocus
                  />
                  {parseFloat(addingGrams) > 0 && (
                    <View style={s.addingPreview}>
                      <Text style={s.addingPreviewText}>
                        {Math.round(addingFood.per100g.calories * (parseFloat(addingGrams) || 0) / 100)} cal · {Math.round(addingFood.per100g.proteinGrams * (parseFloat(addingGrams) || 0) / 100 * 10) / 10}p · {Math.round(addingFood.per100g.carbsGrams * (parseFloat(addingGrams) || 0) / 100 * 10) / 10}c · {Math.round(addingFood.per100g.fatGrams * (parseFloat(addingGrams) || 0) / 100 * 10) / 10}f
                      </Text>
                    </View>
                  )}
                  <GradientButton label="Add to Meal" onPress={handleAddIngredient} />
                </View>
              ) : (
                /* Search step */
                <View style={s.searchContent}>
                  <View style={s.searchHeader}>
                    <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); }}>
                      <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
                    </TouchableOpacity>
                    <Text style={s.searchTitle}>Add Ingredient</Text>
                    <View style={{ width: 24 }} />
                  </View>
                  <View style={s.searchBar}>
                    <Ionicons name="search" size={18} color={Colors.darkTextSecondary} />
                    <TextInput
                      style={s.searchInput}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Search foods..."
                      placeholderTextColor={Colors.darkTextSecondary}
                      autoFocus
                      returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Ionicons name="close-circle" size={18} color={Colors.darkTextSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {searching && (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={Colors.almostAquaDeep} />
                    </View>
                  )}
                  <FlatList
                    data={searchResults}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={s.searchResultRow}
                        onPress={() => { setAddingFood(item); setAddingGrams(String(item.defaultServingGrams || 100)); }}
                      >
                        {item.imageUrl ? (
                          <Image source={{ uri: item.imageUrl }} style={s.searchResultImage} />
                        ) : (
                          <Text style={{ fontSize: 20 }}>{item.emoji || '🍽️'}</Text>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={s.searchResultName} numberOfLines={1}>{item.name}</Text>
                          {item.brand && <Text style={s.searchResultBrand}>{item.brand}</Text>}
                          <Text style={s.searchResultMacro}>{item.per100g.calories} cal per 100g</Text>
                        </View>
                        <Ionicons name="add-circle" size={24} color={Colors.almostAquaDeep} />
                      </TouchableOpacity>
                    )}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: Colors.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingTop: 12, paddingBottom: 32,
    minHeight: '85%', maxHeight: '95%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.10)', alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.darkText },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.glassWhite, alignItems: 'center', justifyContent: 'center' },

  label: {
    fontSize: FontSizes.xs, fontWeight: '700', color: Colors.darkTextSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12,
  },
  input: {
    backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14, height: 48, fontSize: FontSizes.md, color: Colors.darkText,
  },

  // Ingredients
  ingredientsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  addIngredientBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.almostAquaDeep, borderRadius: BorderRadius.md,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  addIngredientText: { fontSize: FontSizes.xs, fontWeight: '700', color: '#fff' },

  emptyIngredients: { alignItems: 'center', paddingVertical: 32, gap: 6 },
  emptyText: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText },
  emptySubtext: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary },

  ingredientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  ingredientImage: { width: 36, height: 36, borderRadius: 8 },
  ingredientEmoji: { fontSize: 20, width: 36, textAlign: 'center' },
  ingredientInfo: { flex: 1 },
  ingredientName: { fontSize: FontSizes.sm, fontWeight: '600', color: Colors.darkText },
  ingredientBrand: { fontSize: 10, color: Colors.almostAquaDeep },
  ingredientMacro: { fontSize: 10, color: Colors.darkTextSecondary },
  ingredientWeight: {
    width: 60, height: 36, backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.glassBlueBorder,
    fontSize: FontSizes.sm, fontWeight: '700', color: Colors.darkText, textAlign: 'center', padding: 0,
  },
  gramLabel: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, fontWeight: '600' },

  // Totals
  totalsCard: {
    backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.glassBlueBorder,
    padding: Spacing.md, marginTop: 16,
  },
  totalsTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: Colors.darkText, textAlign: 'center', marginBottom: 12 },
  totalsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  totalItem: { alignItems: 'center', flex: 1 },
  totalValue: { fontSize: FontSizes.lg, fontWeight: '800' },
  totalLabel: { fontSize: 10, color: Colors.darkTextSecondary, marginTop: 2 },
  totalDivider: { width: 1, height: 28, backgroundColor: 'rgba(0,0,0,0.08)' },

  // Search overlay
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.darkCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  searchContent: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: 16 },
  searchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  searchTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: Colors.darkText },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.glassBlueBorder,
    paddingHorizontal: 14, height: 46, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: FontSizes.md, color: Colors.darkText },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  searchResultImage: { width: 36, height: 36, borderRadius: 8 },
  searchResultName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText },
  searchResultBrand: { fontSize: FontSizes.xs, color: Colors.almostAquaDeep },
  searchResultMacro: { fontSize: 10, color: Colors.darkTextSecondary },

  // Adding food weight step
  addingFoodCard: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  addingFoodImage: { width: 64, height: 64, borderRadius: 12 },
  addingFoodName: { fontSize: FontSizes.lg, fontWeight: '700', color: Colors.darkText, textAlign: 'center' },
  addingFoodBrand: { fontSize: FontSizes.sm, color: Colors.almostAquaDeep },
  addingPreview: {
    backgroundColor: Colors.glassBlue, borderRadius: BorderRadius.md, padding: 12,
    marginVertical: 12, alignItems: 'center',
  },
  addingPreviewText: { fontSize: FontSizes.sm, color: Colors.darkText, fontWeight: '600' },
});
