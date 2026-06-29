/**
 * Unified Food Search Service
 *
 * Searches across three APIs simultaneously:
 *  1. USDA FoodData Central — 400K+ generic & branded foods (free, no key needed for basic)
 *  2. Open Food Facts — 3M+ packaged/barcode products (free, open source)
 *  3. Nutritionix — fast food chains & restaurants (free tier: 50 req/day)
 *
 * Falls back to local COMMON_FOODS when offline.
 */

import { COMMON_FOODS, calcMacros, type BuiltinFood } from '../data/commonFoods';
import { searchRestaurantFoods, type RestaurantFood } from '../data/restaurantFoods';
import { useMealStore, type CachedFood } from '../store/useMealStore';

// ---------------------------------------------------------------------------
// Unified food result type
// ---------------------------------------------------------------------------

export type FoodSource = 'local' | 'usda' | 'openfoodfacts' | 'nutritionix' | 'calorieninjas';

export interface ServingOption {
  label: string;
  grams: number;
  /** e.g. "1 cup", "1 slice", "1 medium" */
  description?: string;
  /** True for universal weight units (gram, ounce, pound, kg) */
  isUniversal?: boolean;
}

export interface UnifiedFood {
  id: string;
  name: string;
  brand?: string;
  source: FoodSource;
  /** Nutritional data per 100g */
  per100g: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams: number;
    // Fats breakdown
    sodiumMg?: number;
    sugarGrams?: number;
    cholesterolMg?: number;
    saturatedFatGrams?: number;
    transFatGrams?: number;
    // Minerals
    potassiumMg?: number;
    calciumMg?: number;
    ironMg?: number;
    magnesiumMg?: number;
    phosphorusMg?: number;
    zincMg?: number;
    copperMg?: number;
    manganeseMg?: number;
    seleniumMcg?: number;
    // Vitamins
    vitaminAMcg?: number;
    vitaminCMg?: number;
    vitaminDMcg?: number;
    vitaminEMg?: number;
    vitaminKMcg?: number;
    vitaminB1Mg?: number;   // Thiamin
    vitaminB2Mg?: number;   // Riboflavin
    vitaminB3Mg?: number;   // Niacin
    vitaminB5Mg?: number;   // Pantothenic acid
    vitaminB6Mg?: number;
    vitaminB12Mcg?: number;
    folateMcg?: number;
    cholineMg?: number;
    // Omega fatty acids
    omega3Grams?: number;   // EPA + DHA + ALA
    omega6Grams?: number;
  };
  /** Available serving sizes */
  servings: ServingOption[];
  /** Default serving size in grams */
  defaultServingGrams: number;
  /** Index into `servings` that should be pre-selected when the user
   *  taps the food. Defaults to 0 if absent. We want this to be the
   *  natural / household-serving entry ("1 salad", "1 cup") rather
   *  than the universal "1 gram" fallback. */
  defaultServingIdx?: number;
  /** Category for UI */
  category?: string;
  emoji?: string;
  /** Barcode (EAN/UPC) if available */
  barcode?: string;
  /** Image URL if available */
  imageUrl?: string;
}

// ---------------------------------------------------------------------------
// API configuration
// ---------------------------------------------------------------------------
//
// SECURITY (P3): the paid / rate-limited vendor keys (USDA, Spoonacular,
// CalorieNinjas) used to be read here from EXPO_PUBLIC_* env vars and the
// vendors were called directly from the client. EXPO_PUBLIC_* values are
// inlined into the shipped JS bundle, so those keys were extractable from
// any installed app. Those calls now go through the `food-search-proxy`
// edge function, which holds the keys as server-side secrets. See
// `callFoodProxy` below.

// Open Food Facts — no key needed, called directly (free, unlimited).
const OFF_BASE = 'https://world.openfoodfacts.net';

// Nutritionix — free tier (register at https://developer.nutritionix.com).
// No credentials configured; kept for the natural-language fallback path.
const NUTRITIONIX_APP_ID = '';
const NUTRITIONIX_API_KEY = '';
const NUTRITIONIX_BASE = 'https://trackapi.nutritionix.com/v2';

// ---------------------------------------------------------------------------
// Vendor proxy — keyed APIs are reached only via the food-search-proxy edge
// function so the vendor keys never ship in the client bundle.
// ---------------------------------------------------------------------------

type FoodProxyProvider = 'usda' | 'spoonacular' | 'calorieninjas';

interface FoodProxyBody {
  provider: FoodProxyProvider;
  query: string;
  /** USDA only */
  pageSize?: number;
  /** USDA only — comma-separated dataTypes */
  dataType?: string;
  /** Spoonacular only */
  number?: number;
}

/**
 * Calls the `food-search-proxy` edge function and returns the vendor's
 * response body unchanged (the proxy passes it through verbatim), or
 * `null` if the provider is unavailable / the call failed. Callers treat
 * `null` as "skip this provider" — the same graceful degradation that the
 * old direct-fetch `try/catch → return []` gave us.
 */
async function callFoodProxy(body: FoodProxyBody): Promise<any | null> {
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.functions.invoke('food-search-proxy', {
      body,
    });
    if (error) return null;
    // The proxy signals a skippable provider with `{ unavailable: true }`.
    if (!data || data.unavailable) return null;
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// USDA FoodData Central
// ---------------------------------------------------------------------------

async function searchUSDA(query: string, limit = 25): Promise<UnifiedFood[]> {
  try {
    const data = await callFoodProxy({
      provider: 'usda',
      query,
      pageSize: limit,
      dataType: 'Foundation,SR Legacy,Branded',
    });
    if (!data) return [];

    return (data.foods || []).map((item: any): UnifiedFood => {
      const nutrients = item.foodNutrients || [];
      const getNutrient = (id: number) =>
        nutrients.find((n: any) => n.nutrientId === id)?.value ?? 0;

      // USDA nutrient IDs — comprehensive extraction
      const calories = getNutrient(1008);
      const protein = getNutrient(1003);
      const carbs = getNutrient(1005);
      const fat = getNutrient(1004);
      const fiber = getNutrient(1079);
      const sodium = getNutrient(1093);
      const sugar = getNutrient(2000);
      const cholesterol = getNutrient(1253);
      const saturatedFat = getNutrient(1258);
      // Minerals
      const potassium = getNutrient(1092);
      const calcium = getNutrient(1087);
      const iron = getNutrient(1089);
      const magnesium = getNutrient(1090);
      const phosphorus = getNutrient(1091);
      const zinc = getNutrient(1095);
      const copper = getNutrient(1098);
      const manganese = getNutrient(1101);
      const selenium = getNutrient(1103);
      // Vitamins
      const vitA = getNutrient(1106);
      const vitC = getNutrient(1162);
      const vitD = getNutrient(1114);
      const vitE = getNutrient(1109);
      const vitK = getNutrient(1185);
      const vitB1 = getNutrient(1165);  // Thiamin
      const vitB2 = getNutrient(1166);  // Riboflavin
      const vitB3 = getNutrient(1167);  // Niacin
      const vitB5 = getNutrient(1170);  // Pantothenic acid
      const vitB6 = getNutrient(1175);
      const vitB12 = getNutrient(1178);
      const folate = getNutrient(1177);
      const choline = getNutrient(1180);
      // Omega fatty acids
      const omega3 = getNutrient(1404) + getNutrient(1278) + getNutrient(1272); // ALA + EPA + DHA
      const omega6 = getNutrient(1269); // Linoleic acid

      // Build serving options from available measures (food-specific first)
      const servings: ServingOption[] = [];

      if (item.foodMeasures) {
        for (const m of item.foodMeasures) {
          if (m.gramWeight && m.disseminationText) {
            servings.push({
              label: m.disseminationText,
              grams: m.gramWeight,
              description: m.disseminationText,
            });
          }
        }
      }

      // Also check servingSize from branded items. The user-facing label
      // prefers the household description ("1 salad (270g)") over the
      // raw weight ("270g") because nobody eats salad in raw grams.
      // householdServingFullText is the USDA field that carries the
      // human-readable form for branded items.
      if (item.servingSize && item.servingSizeUnit) {
        const rawLabel = `${item.servingSize}${item.servingSizeUnit}`;
        const friendly = item.householdServingFullText?.trim();
        const label = friendly
          ? `${friendly} (${rawLabel})`
          : rawLabel;
        if (!servings.some((s) => s.label === label)) {
          servings.unshift({
            label,
            grams: item.servingSize,
            description: friendly || rawLabel,
          });
        }
      }

      const brandName = item.brandName || item.brandOwner;

      const foodName = formatFoodName(item.description || item.lowercaseDescription || '');
      // Make sure the user-facing picker doesn't default to "1 gram of salad."
      // When USDA didn't ship a household serving, prepend a category-aware
      // estimate so index 0 is something humans actually eat.
      const finalServings = prependSensibleDefault(
        appendUniversalUnits(servings),
        foodName,
      );

      return {
        id: `usda-${item.fdcId}`,
        name: foodName,
        brand: brandName || undefined,
        source: 'usda',
        per100g: {
          calories: Math.round(calories),
          proteinGrams: round1(protein),
          carbsGrams: round1(carbs),
          fatGrams: round1(fat),
          fiberGrams: round1(fiber),
          sodiumMg: Math.round(sodium),
          sugarGrams: round1(sugar),
          cholesterolMg: Math.round(cholesterol),
          saturatedFatGrams: round1(saturatedFat),
          transFatGrams: round1(getNutrient(1257)),
          // Minerals
          potassiumMg: Math.round(potassium),
          calciumMg: Math.round(calcium),
          ironMg: round1(iron),
          magnesiumMg: Math.round(magnesium),
          phosphorusMg: Math.round(phosphorus),
          zincMg: round1(zinc),
          copperMg: round1(copper),
          manganeseMg: round1(manganese),
          seleniumMcg: round1(selenium),
          // Vitamins
          vitaminAMcg: Math.round(vitA),
          vitaminCMg: round1(vitC),
          vitaminDMcg: round1(vitD),
          vitaminEMg: round1(vitE),
          vitaminKMcg: round1(vitK),
          vitaminB1Mg: round1(vitB1),
          vitaminB2Mg: round1(vitB2),
          vitaminB3Mg: round1(vitB3),
          vitaminB5Mg: round1(vitB5),
          vitaminB6Mg: round1(vitB6),
          vitaminB12Mcg: round1(vitB12),
          folateMcg: round1(folate),
          cholineMg: round1(choline),
          // Omega fatty acids
          omega3Grams: round1(omega3),
          omega6Grams: round1(omega6),
        },
        servings: finalServings,
        defaultServingGrams: finalServings[0]?.grams || item.servingSize || 100,
        // Index 0 is either USDA's household serving (when available)
        // or the category-aware sensibleServingGrams() prepend. Either
        // way the user opens the picker on something a human would eat.
        defaultServingIdx: 0,
        category: guessCategory(item.description),
        emoji: guessEmoji(item.description),
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Open Food Facts
// ---------------------------------------------------------------------------

/** Quick image lookup — tries Open Food Facts first, then UPC Item DB */
async function fetchProductImage(query: string): Promise<string | undefined> {
  // 1. Try Open Food Facts (free, unlimited)
  try {
    const offUrl = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=1&fields=image_small_url,image_front_small_url`;
    const offRes = await fetch(offUrl);
    if (offRes.ok) {
      const offData = await offRes.json();
      const p = offData.products?.[0];
      const img = p?.image_small_url || p?.image_front_small_url;
      if (img) return img;
    }
  } catch { /* fall through */ }

  // 2. Try UPC Item DB (free, 100/day — good for grocery store products)
  try {
    const upcUrl = `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(query)}&match_mode=0&type=product`;
    const upcRes = await fetch(upcUrl);
    if (upcRes.ok) {
      const upcData = await upcRes.json();
      const item = upcData.items?.[0];
      if (item?.images?.[0]) return item.images[0];
    }
  } catch { /* no image */ }

  return undefined;
}

async function searchOpenFoodFacts(query: string, limit = 25): Promise<UnifiedFood[]> {
  try {
    const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=code,product_name,brands,serving_size,nutriments,image_small_url,categories_tags`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    return (data.products || [])
      .filter((p: any) => p.product_name && p.nutriments)
      .map((p: any): UnifiedFood => {
        const n = p.nutriments;

        // Parse serving size (food-specific first)
        const servings: ServingOption[] = [];

        if (p.serving_size) {
          const servingGrams = parseServingToGrams(p.serving_size);
          if (servingGrams > 0) {
            servings.push({
              label: `1 serving (${p.serving_size})`,
              grams: servingGrams,
              description: p.serving_size,
            });
          }
        }

        const offFoodName = formatFoodName(p.product_name);
        const offFinalServings = prependSensibleDefault(
          appendUniversalUnits(servings),
          offFoodName,
        );
        return {
          id: `off-${p.code}`,
          name: offFoodName,
          brand: p.brands || undefined,
          source: 'openfoodfacts',
          per100g: {
            calories: Math.round(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0),
            proteinGrams: round1(n.proteins_100g ?? 0),
            carbsGrams: round1(n.carbohydrates_100g ?? 0),
            fatGrams: round1(n.fat_100g ?? 0),
            fiberGrams: round1(n.fiber_100g ?? 0),
            sodiumMg: Math.round((n.sodium_100g ?? 0) * 1000),
            sugarGrams: round1(n.sugars_100g ?? 0),
            saturatedFatGrams: round1(n['saturated-fat_100g'] ?? 0),
            transFatGrams: round1(n['trans-fat_100g'] ?? 0),
            potassiumMg: Math.round((n.potassium_100g ?? 0) * 1000),
            calciumMg: Math.round((n.calcium_100g ?? 0) * 1000),
            ironMg: round1((n.iron_100g ?? 0) * 1000),
          },
          servings: offFinalServings,
          defaultServingGrams: offFinalServings[0]?.grams || parseServingToGrams(p.serving_size) || 100,
          category: guessCategory(p.product_name),
          emoji: guessEmoji(p.product_name),
          barcode: p.code,
          imageUrl: p.image_small_url,
        };
      });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Nutritionix (fast food, restaurants, common foods)
// ---------------------------------------------------------------------------

async function searchNutritionix(query: string, limit = 10): Promise<UnifiedFood[]> {
  // Skip if no API credentials configured
  if (!NUTRITIONIX_APP_ID && !NUTRITIONIX_API_KEY) {
    return searchNutritionixNatural(query);
  }

  try {
    const url = `${NUTRITIONIX_BASE}/search/instant?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'x-app-id': NUTRITIONIX_APP_ID,
        'x-app-key': NUTRITIONIX_API_KEY,
      },
    });
    if (!res.ok) return [];
    const data = await res.json();

    const results: UnifiedFood[] = [];

    // Common foods (natural language)
    for (const item of (data.common || []).slice(0, limit)) {
      results.push(nutritionixItemToUnified(item, 'common'));
    }

    // Branded foods (restaurants, fast food)
    for (const item of (data.branded || []).slice(0, limit)) {
      results.push(nutritionixItemToUnified(item, 'branded'));
    }

    return results;
  } catch {
    return [];
  }
}

/** Fallback: use Nutritionix natural language endpoint (no key needed for demo) */
async function searchNutritionixNatural(_query: string): Promise<UnifiedFood[]> {
  // Without API keys, we can't use Nutritionix — return empty
  return [];
}

function nutritionixItemToUnified(item: any, type: 'common' | 'branded'): UnifiedFood {
  const servingWeight = item.serving_weight_grams || 100;
  const servingQty = item.serving_qty || 1;
  const servingUnit = item.serving_unit || 'serving';

  // Nutritionix gives per-serving data, convert to per-100g
  const scale = servingWeight > 0 ? 100 / servingWeight : 1;

  // Branded items (Quest bars, Chick-fil-A nuggets, etc.) should not show
  // volumetric fallbacks — "1 cup of Quest bar" is nonsense. Keep only the
  // brand's actual serving plus weight-only universal units.
  const baseServing: ServingOption = {
    label: `${servingQty} ${servingUnit}`,
    grams: servingWeight,
    description: `${servingQty} ${servingUnit}`,
  };
  const servings: ServingOption[] = type === 'branded'
    ? appendWeightOnlyUnits([baseServing])
    : appendUniversalUnits([baseServing]);

  return {
    id: `nix-${type}-${item.nix_item_id || item.tag_id || item.food_name?.replace(/\s/g, '-')}`,
    name: formatFoodName(item.food_name || ''),
    brand: item.brand_name || undefined,
    source: 'nutritionix',
    per100g: {
      calories: Math.round((item.nf_calories || 0) * scale),
      proteinGrams: round1((item.nf_protein || 0) * scale),
      carbsGrams: round1((item.nf_total_carbohydrate || 0) * scale),
      fatGrams: round1((item.nf_total_fat || 0) * scale),
      fiberGrams: round1((item.nf_dietary_fiber || 0) * scale),
      sodiumMg: Math.round((item.nf_sodium || 0) * scale),
      sugarGrams: round1((item.nf_sugars || 0) * scale),
      cholesterolMg: Math.round((item.nf_cholesterol || 0) * scale),
      saturatedFatGrams: round1((item.nf_saturated_fat || 0) * scale),
      potassiumMg: Math.round((item.nf_potassium || 0) * scale),
    },
    servings,
    defaultServingGrams: servingWeight,
    category: guessCategory(item.food_name),
    emoji: guessEmoji(item.food_name),
    imageUrl: item.photo?.thumb,
  };
}

// ---------------------------------------------------------------------------
// Spoonacular — IMAGE ONLY (150 req/day, conserve quota)
// Fetches food images by keyword. Does NOT pull nutrition (USDA handles that).
// Results cached in memory so repeat searches don't burn quota.
// ---------------------------------------------------------------------------

const spoonImageCache = new Map<string, string | null>();

async function getSpoonacularImage(query: string): Promise<string | undefined> {
  const cacheKey = query.toLowerCase().trim();
  if (spoonImageCache.has(cacheKey)) {
    return spoonImageCache.get(cacheKey) ?? undefined;
  }

  try {
    const data = await callFoodProxy({ provider: 'spoonacular', query, number: 1 });
    // Provider unavailable (no key / outage) → skip, but cache the miss so
    // we don't re-invoke the proxy for the same query this session.
    if (!data) { spoonImageCache.set(cacheKey, null); return undefined; }

    const item = data.results?.[0];
    if (item?.image) {
      const imageUrl = `https://img.spoonacular.com/ingredients_250x250/${item.image}`;
      spoonImageCache.set(cacheKey, imageUrl);
      return imageUrl;
    }
    spoonImageCache.set(cacheKey, null);
    return undefined;
  } catch {
    spoonImageCache.set(cacheKey, null);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// CalorieNinjas — NATURAL LANGUAGE ONLY
// Only fires for multi-word queries that look like meal descriptions
// e.g. "2 eggs and toast", "grilled chicken with rice"
// ---------------------------------------------------------------------------

function isNaturalLanguageQuery(query: string): boolean {
  // Detect phrases like "2 eggs", "cup of rice", "grilled chicken with broccoli"
  const words = query.trim().split(/\s+/);
  if (words.length < 2) return false;
  // Has a number at the start or contains connector words
  if (/^\d/.test(query)) return true;
  if (/\b(and|with|of|cup|cups|slice|slices|bowl|plate|piece|pieces)\b/i.test(query)) return true;
  return false;
}

async function searchCalorieNinjas(query: string): Promise<UnifiedFood[]> {
  if (!isNaturalLanguageQuery(query)) return [];

  try {
    const data = await callFoodProxy({ provider: 'calorieninjas', query });
    if (!data) return [];

    return (data.items || []).map((item: any): UnifiedFood => {
      const servingG = item.serving_size_g || 100;
      const scale = servingG > 0 ? 100 / servingG : 1;

      return {
        id: `cn-${item.name?.replace(/\s/g, '-')}-${Date.now()}`,
        name: formatFoodName(item.name || query),
        source: 'calorieninjas',
        per100g: {
          calories: Math.round((item.calories || 0) * scale),
          proteinGrams: round1((item.protein_g || 0) * scale),
          carbsGrams: round1((item.carbohydrates_total_g || 0) * scale),
          fatGrams: round1((item.fat_total_g || 0) * scale),
          fiberGrams: round1((item.fiber_g || 0) * scale),
          sodiumMg: Math.round((item.sodium_mg || 0) * scale),
          sugarGrams: round1((item.sugar_g || 0) * scale),
          cholesterolMg: Math.round((item.cholesterol_mg || 0) * scale),
          saturatedFatGrams: round1((item.fat_saturated_g || 0) * scale),
          potassiumMg: Math.round((item.potassium_mg || 0) * scale),
        },
        servings: appendUniversalUnits([
          { label: `1 serving (${servingG}g)`, grams: servingG },
        ]),
        defaultServingGrams: servingG,
        category: guessCategory(item.name || query),
        emoji: guessEmoji(item.name || query),
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Local food search (offline fallback)
// ---------------------------------------------------------------------------

function searchLocal(query: string): UnifiedFood[] {
  // Token-AND matching: split the query on whitespace and require EVERY
  // non-empty token to appear somewhere in the food name. This makes
  // "grilled chicken breast" find "chicken, breast (grilled)" and
  // "breast chicken grilled" — order doesn't matter.
  //
  // Previous implementation used a single substring `includes` check
  // which failed any time the user's word order didn't exactly match
  // the canonical food name (TestFlight feedback item #6).
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((tok) => tok.replace(/[^a-z0-9]/g, ''))
    .filter((tok) => tok.length > 0);
  if (tokens.length === 0) return [];
  return COMMON_FOODS.filter((f) => {
    const hay = f.name.toLowerCase();
    return tokens.every((tok) => hay.includes(tok));
  }).map(builtinToUnified);
}

function restaurantToUnified(food: RestaurantFood): UnifiedFood {
  const scale = food.servingGrams > 0 ? 100 / food.servingGrams : 1;
  return {
    id: `rest-${food.id}`,
    name: food.name,
    brand: food.brand,
    source: 'local',
    per100g: {
      calories: Math.round(food.calories * scale),
      proteinGrams: round1(food.proteinGrams * scale),
      carbsGrams: round1(food.carbsGrams * scale),
      fatGrams: round1(food.fatGrams * scale),
      fiberGrams: round1(food.fiberGrams * scale),
      sodiumMg: food.sodiumMg ? Math.round(food.sodiumMg * scale) : undefined,
      sugarGrams: food.sugarGrams ? round1(food.sugarGrams * scale) : undefined,
    },
    servings: appendUniversalUnits([
      { label: food.servingLabel, grams: food.servingGrams },
      ...(food.additionalServings || []),
    ]),
    defaultServingGrams: food.servingGrams,
    category: food.category,
    emoji: guessEmoji(food.name),
  };
}

export function builtinToUnified(food: BuiltinFood): UnifiedFood {
  return {
    id: `local-${food.id}`,
    name: food.name,
    source: 'local',
    per100g: { ...food.per100g },
    servings: appendUniversalUnits([...food.commonServings]),
    defaultServingGrams: food.commonServings[0]?.grams ?? 100,
    category: food.category,
    emoji: food.emoji,
  };
}

// ---------------------------------------------------------------------------
// Barcode lookup (Open Food Facts + USDA)
// ---------------------------------------------------------------------------

export async function lookupBarcode(barcode: string): Promise<UnifiedFood | null> {
  // Try Open Food Facts first (best barcode coverage)
  try {
    const url = `${OFF_BASE}/api/v0/product/${barcode}.json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        const n = p.nutriments || {};

        const servings: ServingOption[] = [];

        // Product-specific serving from label
        if (p.serving_size) {
          const servingGrams = parseServingToGrams(p.serving_size);
          if (servingGrams > 0) {
            servings.push({
              label: `1 serving (${p.serving_size})`,
              grams: servingGrams,
              description: p.serving_size,
            });
          }
        }

        // If product has serving quantity info (e.g. "8 strips per bag")
        if (p.serving_quantity) {
          servings.push({
            label: `1 serving`,
            grams: p.serving_quantity,
          });
        }

        // Parse product quantity for per-package option
        if (p.product_quantity) {
          const pkgGrams = parseFloat(p.product_quantity);
          if (pkgGrams > 0) {
            servings.push({
              label: `Full package (${pkgGrams}g)`,
              grams: pkgGrams,
            });
          }
        }

        // Parse number of pieces/items from serving description
        const piecesMatch = p.serving_size?.match(/(\d+)\s*(pieces?|strips?|nuggets?|crackers?|cookies?|chips?|slices?|count|ct)/i);
        if (piecesMatch) {
          const perPieceGrams = (parseServingToGrams(p.serving_size) || 100) / parseInt(piecesMatch[1]);
          if (perPieceGrams > 0) {
            servings.unshift({
              label: `1 ${piecesMatch[2].replace(/s$/, '')}`,
              grams: Math.round(perPieceGrams * 10) / 10,
              description: `1 ${piecesMatch[2].replace(/s$/, '')}`,
            });
          }
        }

        return {
          id: `off-${p.code || barcode}`,
          name: formatFoodName(p.product_name || 'Unknown Product'),
          brand: p.brands || undefined,
          source: 'openfoodfacts',
          per100g: {
            calories: Math.round(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0),
            proteinGrams: round1(n.proteins_100g ?? 0),
            carbsGrams: round1(n.carbohydrates_100g ?? 0),
            fatGrams: round1(n.fat_100g ?? 0),
            fiberGrams: round1(n.fiber_100g ?? 0),
            sodiumMg: Math.round((n.sodium_100g ?? 0) * 1000),
            sugarGrams: round1(n.sugars_100g ?? 0),
            saturatedFatGrams: round1(n['saturated-fat_100g'] ?? 0),
            transFatGrams: round1(n['trans-fat_100g'] ?? 0),
            potassiumMg: Math.round((n.potassium_100g ?? 0) * 1000),
            calciumMg: Math.round((n.calcium_100g ?? 0) * 1000),
            ironMg: round1((n.iron_100g ?? 0) * 1000),
          },
          servings: appendUniversalUnits(servings),
          defaultServingGrams: parseServingToGrams(p.serving_size) || 100,
          category: guessCategory(p.product_name),
          emoji: guessEmoji(p.product_name),
          barcode: barcode,
          imageUrl: p.image_small_url || p.image_front_small_url,
        };
      }
    }
  } catch { /* fall through to USDA */ }

  // Fallback: try USDA barcode search (via the proxy — no key in client)
  try {
    const data = await callFoodProxy({
      provider: 'usda',
      query: barcode,
      pageSize: 1,
      dataType: 'Branded',
    });
    if (data?.foods?.length > 0) {
      const results = await searchUSDA(data.foods[0].description, 1);
      if (results.length > 0) return results[0];
    }
  } catch { /* no result */ }

  return null;
}

// ---------------------------------------------------------------------------
// Unified search — queries all APIs in parallel
// ---------------------------------------------------------------------------

export async function searchAllFoods(
  query: string,
  options?: { limit?: number },
): Promise<UnifiedFood[]> {
  const q = query.trim();
  if (!q) return [];

  const limit = options?.limit ?? 25;

  // ── Check local cache first (instant, no API calls) ──
  const { searchCachedFoods, cacheFoods } = useMealStore.getState();
  const cachedResults = searchCachedFoods(q).map(cachedToUnified);

  // Instant offline results
  const localResults = searchLocal(q);
  const restaurantResults = searchRestaurantFoods(q).map(restaurantToUnified);

  // USDA = primary nutrition source (free, unlimited, gold standard)
  // Open Food Facts = free, unlimited, strong on generic/home-cooked foods
  const [usdaResults, offResults] = await Promise.all([
    searchUSDA(q, limit).catch(() => [] as UnifiedFood[]),
    searchOpenFoodFacts(q, limit).catch(() => [] as UnifiedFood[]),
  ]);

  // ── Smart deduplication ──
  // Generic foods (no brand) are deduped by full descriptive name — so
  // "egg scrambled", "egg hard boiled", "egg raw" are all kept separately.
  // Branded foods (Tyson, Kirkland, etc.) each get their own entry.
  const seen = new Map<string, number>();
  const merged: UnifiedFood[] = [];

  // Preserves cooking methods and preparation details so they don't collapse together.
  const COOKING_MODIFIERS = [
    'scrambled', 'boiled', 'fried', 'poached', 'baked', 'grilled', 'roasted',
    'steamed', 'raw', 'cooked', 'hard boiled', 'soft boiled', 'sunny side',
    'over easy', 'whipped', 'smoked', 'dried', 'fresh', 'frozen', 'canned',
  ];

  const normalizeKey = (name: string) => {
    const lower = name.toLowerCase();
    // Extract cooking modifier if present (preserves it in dedup key)
    const modifier = COOKING_MODIFIERS.find((m) => lower.includes(m)) ?? '';
    const base = lower
      .replace(/\(.*?\)/g, ' ')          // remove parenthetical
      .replace(/,.*$/, ' ')              // remove everything after comma
      .replace(/[^a-z0-9\s]/g, ' ')      // normalize punctuation
      .replace(/\s+/g, ' ')
      .trim();
    return modifier ? `${base}__${modifier}` : base;
  };

  const addUnique = (food: UnifiedFood) => {
    const normalized = normalizeKey(food.name);
    // Branded foods get brand in the key so "Tyson Chicken" != generic "Chicken"
    const dedupKey = food.brand
      ? `${normalized}__${food.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      : normalized;

    const existingIdx = seen.get(dedupKey);

    if (existingIdx == null) {
      seen.set(dedupKey, merged.length);
      merged.push(food);
    } else {
      // Merge: take image from new if existing has none
      const existing = merged[existingIdx];
      if (!existing.imageUrl && food.imageUrl) {
        existing.imageUrl = food.imageUrl;
      }
      // Merge: take more serving options from new source
      if (food.servings.length > existing.servings.length) {
        const existingLabels = new Set(existing.servings.map((s) => s.label));
        for (const s of food.servings) {
          if (!existingLabels.has(s.label)) {
            existing.servings.push(s);
          }
        }
      }
    }
  };

  // Priority: Local (offline, matches preserved) → Cache → USDA → Open Food Facts → Restaurants
  // Local results first ensures curated generic foods (scrambled egg, boiled egg) appear
  // before USDA's branded-heavy results.
  localResults.forEach(addUnique);
  cachedResults.forEach(addUnique);
  usdaResults.forEach(addUnique);
  offResults.forEach(addUnique);
  restaurantResults.forEach(addUnique);

  // ── Fill images for branded foods via Open Food Facts (free, unlimited) ──
  const foodsNeedingImages = merged.filter((f) => !f.imageUrl && f.brand);
  if (foodsNeedingImages.length > 0) {
    // Batch lookup: search OFF for each branded food missing an image
    const imageLookups = await Promise.allSettled(
      foodsNeedingImages.slice(0, 10).map((f) => fetchProductImage(f.brand! + ' ' + f.name)),
    );
    for (let i = 0; i < Math.min(foodsNeedingImages.length, 10); i++) {
      if (imageLookups[i].status === 'fulfilled') {
        const img = (imageLookups[i] as PromiseFulfilledResult<string | undefined>).value;
        if (img) foodsNeedingImages[i].imageUrl = img;
      }
    }
  }

  // For remaining foods without images (generic, no brand), try Spoonacular (cached)
  const stillNeedImages = merged.filter((f) => !f.imageUrl);
  if (stillNeedImages.length > 0) {
    const toFetch = stillNeedImages.slice(0, 3);
    const imageResults = await Promise.allSettled(
      toFetch.map((f) => getSpoonacularImage(f.name)),
    );
    for (let i = 0; i < toFetch.length; i++) {
      if (imageResults[i].status === 'fulfilled') {
        toFetch[i].imageUrl = (imageResults[i] as PromiseFulfilledResult<string | undefined>).value;
      }
    }
  }

  // ── Save all results to local cache for future instant lookups ──
  const toCache: CachedFood[] = merged.map((f) => ({
    id: f.id,
    name: f.name,
    brand: f.brand,
    per100g: {
      calories: f.per100g.calories,
      proteinGrams: f.per100g.proteinGrams,
      carbsGrams: f.per100g.carbsGrams,
      fatGrams: f.per100g.fatGrams,
      fiberGrams: f.per100g.fiberGrams,
      sodiumMg: f.per100g.sodiumMg,
      sugarGrams: f.per100g.sugarGrams,
      cholesterolMg: f.per100g.cholesterolMg,
      saturatedFatGrams: f.per100g.saturatedFatGrams,
    },
    servings: f.servings,
    defaultServingGrams: f.defaultServingGrams,
    category: f.category,
    emoji: f.emoji,
    imageUrl: f.imageUrl,
    searchKey: (f.name + ' ' + (f.brand || '')).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim(),
    cachedAt: new Date().toISOString(),
  }));
  cacheFoods(toCache);

  return merged;
}

/** Convert a cached food back to UnifiedFood */
function cachedToUnified(cached: CachedFood): UnifiedFood {
  return {
    id: cached.id,
    name: cached.name,
    brand: cached.brand,
    source: 'local',
    per100g: { ...cached.per100g },
    servings: cached.servings,
    defaultServingGrams: cached.defaultServingGrams,
    category: cached.category,
    emoji: cached.emoji,
    imageUrl: cached.imageUrl,
  };
}

// ---------------------------------------------------------------------------
// Calculate macros for a given amount
// ---------------------------------------------------------------------------

export function calcUnifiedMacros(food: UnifiedFood, grams: number) {
  const scale = grams / 100;
  const p = food.per100g;
  const s = (v: number | undefined) => v ? round1(v * scale) : undefined;
  const si = (v: number | undefined) => v ? Math.round(v * scale) : undefined;
  return {
    calories: Math.round(p.calories * scale),
    proteinGrams: round1(p.proteinGrams * scale),
    carbsGrams: round1(p.carbsGrams * scale),
    fatGrams: round1(p.fatGrams * scale),
    fiberGrams: round1(p.fiberGrams * scale),
    // All micronutrients
    sodiumMg: si(p.sodiumMg),
    sugarGrams: s(p.sugarGrams),
    cholesterolMg: si(p.cholesterolMg),
    saturatedFatGrams: s(p.saturatedFatGrams),
    transFatGrams: s(p.transFatGrams),
    // Minerals
    potassiumMg: si(p.potassiumMg),
    calciumMg: si(p.calciumMg),
    ironMg: s(p.ironMg),
    magnesiumMg: si(p.magnesiumMg),
    phosphorusMg: si(p.phosphorusMg),
    zincMg: s(p.zincMg),
    copperMg: s(p.copperMg),
    manganeseMg: s(p.manganeseMg),
    seleniumMcg: s(p.seleniumMcg),
    // Vitamins
    vitaminAMcg: si(p.vitaminAMcg),
    vitaminCMg: s(p.vitaminCMg),
    vitaminDMcg: s(p.vitaminDMcg),
    vitaminEMg: s(p.vitaminEMg),
    vitaminKMcg: s(p.vitaminKMcg),
    vitaminB1Mg: s(p.vitaminB1Mg),
    vitaminB2Mg: s(p.vitaminB2Mg),
    vitaminB3Mg: s(p.vitaminB3Mg),
    vitaminB5Mg: s(p.vitaminB5Mg),
    vitaminB6Mg: s(p.vitaminB6Mg),
    vitaminB12Mcg: s(p.vitaminB12Mcg),
    folateMcg: s(p.folateMcg),
    cholineMg: s(p.cholineMg),
    // Omega fatty acids
    omega3Grams: s(p.omega3Grams),
    omega6Grams: s(p.omega6Grams),
  };
}

// ---------------------------------------------------------------------------
// Universal weight units (always appended to every food, MFP-style)
// ---------------------------------------------------------------------------

// Universal weight units appended to every food. Volumetric entries are
// approximate (water density) — when USDA returns its own per-food cup /
// tbsp serving with accurate grams, we use that and keep these as fallback
// so the user always has a familiar measure ("1 cup yogurt") even when
// the API didn't ship one.
const UNIVERSAL_WEIGHT_UNITS: ServingOption[] = [
  { label: '1 gram',          grams: 1,      isUniversal: true },
  { label: '1 ounce',         grams: 28.35,  isUniversal: true },
  { label: '1 pound',         grams: 453.6,  isUniversal: true },
  { label: '1 kilogram',      grams: 1000,   isUniversal: true },
  // Volumetric — approximate, water density. UI labels "(approx)" so the
  // user knows it's a rough estimate vs. the food-specific servings above.
  { label: '1 teaspoon (approx)',   grams: 5,    isUniversal: true },
  { label: '1 tablespoon (approx)', grams: 15,   isUniversal: true },
  { label: '1 fl oz (approx)',      grams: 30,   isUniversal: true },
  { label: '1/2 cup (approx)',      grams: 120,  isUniversal: true },
  { label: '1 cup (approx)',        grams: 240,  isUniversal: true },
];

/** Removes old generic units (100g, 1 oz) and appends universal weight units */
function appendUniversalUnits(servings: ServingOption[]): ServingOption[] {
  // Keep only food-specific servings (remove old generic 100g / 1 oz)
  const result = servings.filter(
    (s) => !['100g', '1 oz'].includes(s.label),
  );
  // Append universal units, skip if label already exists
  const existing = new Set(result.map((s) => s.label.toLowerCase()));
  for (const u of UNIVERSAL_WEIGHT_UNITS) {
    if (!existing.has(u.label.toLowerCase())) {
      result.push(u);
    }
  }
  return result;
}

/** Returns a reasonable "1 serving" gram estimate by food name.
 *  Used when USDA / Open Food Facts didn't ship a natural serving size.
 *  Nobody eats 1 gram of salad — this gives the picker a default that
 *  matches what a human would actually log. */
export function sensibleServingGrams(name: string): { label: string; grams: number } {
  if (!name) return { label: '1 serving (approx 100 g)', grams: 100 };
  const n = name.toLowerCase();
  // Strip / slice-shaped foods
  if (/bacon|prosciutto/.test(n))         return { label: '1 strip (≈8 g)',          grams: 8 };
  if (/pepperoni/.test(n))                return { label: '1 slice (≈3 g)',          grams: 3 };
  if (/pizza/.test(n))                    return { label: '1 slice (≈110 g)',        grams: 110 };
  if (/bread|toast/.test(n))              return { label: '1 slice (≈30 g)',         grams: 30 };
  if (/bagel/.test(n))                    return { label: '1 bagel (≈100 g)',        grams: 100 };
  // Whole-item foods
  if (/salad/.test(n))                    return { label: '1 salad (≈250 g)',        grams: 250 };
  if (/sandwich|burger/.test(n))          return { label: '1 sandwich (≈200 g)',     grams: 200 };
  if (/wrap|burrito/.test(n))             return { label: '1 wrap (≈250 g)',         grams: 250 };
  if (/taco/.test(n))                     return { label: '1 taco (≈90 g)',          grams: 90 };
  if (/egg(?!plant)/.test(n))             return { label: '1 large egg (≈50 g)',     grams: 50 };
  if (/banana/.test(n))                   return { label: '1 medium banana (≈118 g)',grams: 118 };
  if (/apple|pear|orange|peach/.test(n))  return { label: '1 medium fruit (≈180 g)', grams: 180 };
  if (/avocado/.test(n))                  return { label: '1 medium avocado (≈200 g)',grams: 200 };
  // Beverages
  if (/coffee|tea/.test(n))               return { label: '1 cup (240 ml)',          grams: 240 };
  if (/smoothie|shake|juice|soda/.test(n))return { label: '12 fl oz (≈360 ml)',      grams: 360 };
  // Protein category fallback
  if (/chicken|beef|turkey|pork|fish|salmon|tuna|shrimp|steak|lamb|sausage/.test(n))
                                          return { label: '1 serving (≈85 g · 3 oz)',grams: 85 };
  // Veg / fruit fallback
  if (/broccoli|spinach|kale|lettuce|carrot|tomato|pepper|onion|vegetable|fruit|berry/.test(n))
                                          return { label: '1 cup (≈100 g)',          grams: 100 };
  // Snack bars / cookies / sweets
  if (/bar|cookie|brownie|candy/.test(n)) return { label: '1 piece (≈40 g)',         grams: 40 };
  // Catch-all
  return { label: '1 serving (approx 100 g)', grams: 100 };
}

/** When no natural serving exists, prepend a category-aware "1 serving"
 *  estimate so the picker defaults to something a human would eat. */
function prependSensibleDefault(
  servings: ServingOption[],
  foodName: string,
): ServingOption[] {
  // If we already have a non-universal "natural" serving, leave alone.
  if (servings.some((s) => !s.isUniversal)) return servings;
  const sensible = sensibleServingGrams(foodName);
  return [
    { label: sensible.label, grams: sensible.grams, description: sensible.label },
    ...servings,
  ];
}

/**
 * Branded-food variant: same as appendUniversalUnits but skips volumetric
 * fallbacks (cup / tbsp / fl oz). For packaged items those are nonsense.
 */
function appendWeightOnlyUnits(servings: ServingOption[]): ServingOption[] {
  const result = servings.filter(
    (s) => !['100g', '1 oz'].includes(s.label),
  );
  const existing = new Set(result.map((s) => s.label.toLowerCase()));
  for (const u of UNIVERSAL_WEIGHT_UNITS) {
    // Filter out anything that's volumetric. The "(approx)" suffix is the
    // marker we already use on those entries.
    if (u.label.includes('(approx)')) continue;
    if (!existing.has(u.label.toLowerCase())) {
      result.push(u);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatFoodName(name: string): string {
  if (!name) return '';
  // Title case, clean up USDA ALL CAPS
  return name
    .toLowerCase()
    .split(/[\s,]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseServingToGrams(serving: string | undefined): number {
  if (!serving) return 0;
  const match = serving.match(/([\d.]+)\s*g/i);
  if (match) return parseFloat(match[1]);
  const mlMatch = serving.match(/([\d.]+)\s*ml/i);
  if (mlMatch) return parseFloat(mlMatch[1]); // approximate ml ≈ g for water-based
  return 0;
}

function guessCategory(name: string): string {
  if (!name) return 'other';
  const n = name.toLowerCase();
  if (/chicken|beef|turkey|pork|fish|salmon|tuna|shrimp|steak|lamb|bacon|sausage|egg/.test(n)) return 'protein';
  if (/rice|bread|pasta|oat|cereal|wheat|tortilla|bagel|noodle/.test(n)) return 'grains';
  if (/apple|banana|berry|grape|orange|mango|peach|pear|melon|fruit/.test(n)) return 'fruits';
  if (/broccoli|spinach|kale|lettuce|carrot|tomato|pepper|onion|vegetable|salad/.test(n)) return 'vegetables';
  if (/milk|cheese|yogurt|cream|butter/.test(n)) return 'dairy';
  if (/oil|avocado|nut|almond|peanut|walnut|seed/.test(n)) return 'fats';
  if (/protein|whey|creatine|supplement|vitamin/.test(n)) return 'supplements';
  return 'other';
}

function guessEmoji(name: string): string {
  if (!name) return '🍽️';
  const n = name.toLowerCase();
  if (/chicken/.test(n)) return '🍗';
  if (/beef|steak|burger/.test(n)) return '🥩';
  if (/pork|bacon/.test(n)) return '🥓';
  if (/fish|salmon|tuna/.test(n)) return '🐟';
  if (/shrimp|prawn/.test(n)) return '🦐';
  if (/egg/.test(n)) return '🥚';
  if (/rice/.test(n)) return '🍚';
  if (/bread|toast|bagel/.test(n)) return '🍞';
  if (/pasta|noodle|spaghetti/.test(n)) return '🍝';
  if (/apple/.test(n)) return '🍎';
  if (/banana/.test(n)) return '🍌';
  if (/orange/.test(n)) return '🍊';
  if (/grape/.test(n)) return '🍇';
  if (/berry|strawberry|blueberry/.test(n)) return '🫐';
  if (/salad|lettuce/.test(n)) return '🥗';
  if (/broccoli/.test(n)) return '🥦';
  if (/carrot/.test(n)) return '🥕';
  if (/tomato/.test(n)) return '🍅';
  if (/cheese/.test(n)) return '🧀';
  if (/milk/.test(n)) return '🥛';
  if (/yogurt/.test(n)) return '🥄';
  if (/avocado/.test(n)) return '🥑';
  if (/nut|almond|peanut/.test(n)) return '🥜';
  if (/pizza/.test(n)) return '🍕';
  if (/taco/.test(n)) return '🌮';
  if (/burrito|wrap/.test(n)) return '🌯';
  if (/sandwich|sub/.test(n)) return '🥪';
  if (/fries|french/.test(n)) return '🍟';
  if (/ice cream/.test(n)) return '🍦';
  if (/cookie/.test(n)) return '🍪';
  if (/cake/.test(n)) return '🍰';
  if (/chocolate/.test(n)) return '🍫';
  if (/coffee/.test(n)) return '☕';
  if (/tea/.test(n)) return '🍵';
  if (/water/.test(n)) return '💧';
  if (/protein|whey/.test(n)) return '💪';
  return '🍽️';
}
