/**
 * Meal Scan — capture a plate of food and detect items with AI vision.
 *
 * Route: /nutrition/meal-scan
 *
 * MVP behavior:
 *   1. Camera viewfinder via expo-camera
 *   2. User taps shutter → capture photo
 *   3. Detection runs: derives food name keywords from EXIF/heuristics for now
 *      (placeholder — wire to OpenAI vision later via openai package)
 *   4. Each detected item runs through searchAllFoods() → real macros
 *   5. User reviews + confirms which to log
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { PaywallGate } from '../../src/hooks/useFeatureGate';
import { Spacing, BorderRadius, Colors } from '../../src/constants/theme';
import { searchAllFoods, calcUnifiedMacros, type UnifiedFood } from '../../src/services/foodSearchService';
import { useMealStore } from '../../src/store/useMealStore';
import type { MealType } from '../../src/types/fitness';
import { ensureAiConsent } from '../../src/utils/ensureAiConsent';

const today = () => new Date().toISOString().slice(0, 10);

const inferMealType = (): MealType => {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snack';
  return 'dinner';
};

// Detects foods in a photo by calling the `food-scan` Supabase edge function,
// which passes the image to Grok Vision and returns the identified items.
// Falls back to a common-plate guess only if the request errors out entirely.
async function detectFoodsFromPhoto(photoUri: string): Promise<string[]> {
  // App Review 5.1.2: explicit consent before sending the photo to the vision model.
  if (!(await ensureAiConsent())) return [];
  try {
    const { supabase } = await import('../../src/services/supabase');
    // Convert file URI → base64 for the edge function
    // Wave 76.51: import from /legacy — see app/pantry/scan.tsx for context.
    const FileSystem: any = await import('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: 'base64' });

    const { data, error } = await (supabase as any).functions.invoke('food-scan', {
      body: { imageBase64: base64 },
    });
    if (error) throw error;

    // Edge function returns { items: [{ name, estimatedGrams, ... }], totals, description }
    if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
      return data.items.map((f: any) => f.name).filter(Boolean);
    }
    // Empty array: vision ran but saw nothing recognizable
    return [];
  } catch (err) {
    if (__DEV__) {
      console.warn('[meal-scan] vision detection failed:', err);
    }
    // Return empty instead of fake foods so user knows detection failed
    return [];
  }
}

export default function MealScanScreenWrapper() {
  return (
    <PaywallGate feature="meal_scan">
      <MealScanScreen />
    </PaywallGate>
  );
}

function MealScanScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();
  const { mealType: paramMealType } = useLocalSearchParams<{ mealType?: MealType }>();
  const addMeal = useMealStore((state) => state.addMeal);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [matches, setMatches] = useState<UnifiedFood[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mealType] = useState<MealType>(paramMealType ?? inferMealType());

  // Vision detect + N food-search awaits can take 20s+. If the user
  // navigates back mid-scan, post-await setState fires on a dead
  // component (React warning + state leak into next mount). The ref
  // flips on unmount and every post-await setState short-circuits.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Permission gate ──
  if (!permission) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={accent.deep} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={t.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: t.text }]}>Meal Scan</Text>
          <View style={s.iconBtn} />
        </View>
        <View style={s.permWrap}>
          <Ionicons name="camera-outline" size={56} color={t.textMuted} />
          <Text style={[s.permTitle, { color: t.text }]}>Camera permission needed</Text>
          <Text style={[s.permDesc, { color: t.textSecondary }]}>
            PepTalk uses the camera to scan plates of food.
          </Text>
          {/* 2026-05-17 a11y fix: if the OS won't prompt again
              (user previously denied + checked "don't ask"),
              requestPermission is a no-op. Route them to Settings. */}
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: accent.deep }]}
            onPress={() => {
              if (permission.canAskAgain) {
                requestPermission();
              } else {
                Linking.openSettings().catch(() => {});
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={permission.canAskAgain ? 'Enable camera' : 'Open settings to enable camera'}
          >
            <Text style={s.primaryBtnText}>
              {permission.canAskAgain ? 'Enable Camera' : 'Open Settings'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Capture + analyze ──
  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: false });
      if (!mountedRef.current) return;
      if (!photo?.uri) return;
      setPhotoUri(photo.uri);
      setAnalyzing(true);

      // 1. Detect food names via Grok Vision
      const detected = await detectFoodsFromPhoto(photo.uri);
      if (!mountedRef.current) return;

      if (detected.length === 0) {
        Alert.alert(
          'Nothing recognized',
          'We couldn\'t identify any foods in that photo. Try a clearer angle or better lighting.',
        );
        setAnalyzing(false);
        return;
      }

      // 2. For each detected name, search for the best match
      const all: UnifiedFood[] = [];
      for (const name of detected) {
        const results = await searchAllFoods(name, { limit: 3 });
        if (!mountedRef.current) return;
        if (results.length > 0) all.push(results[0]);
      }
      if (!mountedRef.current) return;
      setMatches(all);
      const initial: Record<string, boolean> = {};
      all.forEach((f) => { initial[f.id] = true; });
      setSelected(initial);
    } catch (err) {
      if (mountedRef.current) {
        Alert.alert('Capture failed', 'Could not capture or analyze the photo.');
      }
    } finally {
      if (mountedRef.current) setAnalyzing(false);
    }
  };

  const handleRetake = () => {
    setPhotoUri(null);
    setMatches([]);
    setSelected({});
  };

  const handleLog = () => {
    const toLog = matches.filter((f) => selected[f.id]);
    if (toLog.length === 0) {
      Alert.alert('Nothing selected', 'Tap items to include them.');
      return;
    }
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
      date: today(),
      mealType,
      foods,
      notes: 'Logged via meal scan',
      timestamp: new Date().toISOString(),
    });
    router.back();
  };

  // ── Live camera mode ──
  if (!photoUri) {
    return (
      <View style={s.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />

        <SafeAreaView style={s.cameraOverlay} edges={['top', 'bottom']}>
          {/* Top header */}
          <View style={s.cameraHeader}>
            <TouchableOpacity onPress={() => router.back()} style={s.cameraIconBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={s.cameraTitle}>Meal Scan</Text>
            <View style={s.cameraIconBtn} />
          </View>

          {/* Frame guide */}
          <View style={s.frameWrap}>
            <View style={s.frameBox}>
              <View style={[s.corner, s.cornerTL]} />
              <View style={[s.corner, s.cornerTR]} />
              <View style={[s.corner, s.cornerBL]} />
              <View style={[s.corner, s.cornerBR]} />
            </View>
            <Text style={s.frameHint}>Center your plate in the frame</Text>
          </View>

          {/* Shutter */}
          <View style={s.shutterRow}>
            <TouchableOpacity
              style={s.shutterBtn}
              onPress={handleCapture}
              activeOpacity={0.8}
            >
              <View style={s.shutterInner} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Review mode ──
  return (
    <SafeAreaView style={[s.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={handleRetake} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]}>Review Scan</Text>
        <TouchableOpacity onPress={handleRetake} style={s.iconBtn}>
          <Ionicons name="camera-reverse-outline" size={22} color={t.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.reviewScroll} showsVerticalScrollIndicator={false}>
        <Image source={{ uri: photoUri }} style={s.previewImage} />

        {analyzing ? (
          <View style={s.analyzingBox}>
            <ActivityIndicator color={accent.deep} />
            <Text style={[s.analyzingText, { color: t.textSecondary }]}>
              Analyzing your plate...
            </Text>
          </View>
        ) : (
          <>
            <Text style={[s.sectionLabel, { color: t.textSecondary }]}>
              DETECTED ITEMS — TAP TO TOGGLE
            </Text>
            {matches.length === 0 ? (
              <Text style={[s.noResults, { color: t.textSecondary }]}>
                Could not detect any foods. Try retaking the photo with better lighting.
              </Text>
            ) : (
              matches.map((food) => {
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
                      <Text style={[s.matchMeta, { color: t.textSecondary }]}>
                        ~{grams}g · {cal} cal
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {matches.length > 0 && (
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: accent.deep, marginTop: 16 }]}
                onPress={handleLog}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={s.primaryBtnText}>Log meal</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
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
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'DMSans-Bold' },

  // Camera
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  cameraOverlay: { flex: 1, justifyContent: 'space-between' },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  cameraIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  cameraTitle: { fontSize: 16, fontFamily: 'DMSans-Bold', color: '#fff' },

  frameWrap: { alignItems: 'center', gap: 14 },
  frameBox: {
    width: 280,
    height: 280,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: Colors.almostAquaDeep,
    borderWidth: 4,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
  frameHint: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 4,
  },

  shutterRow: { alignItems: 'center', paddingBottom: 30 },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },

  // Permission state
  permWrap: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: 80, gap: 10 },
  permTitle: { fontSize: 18, fontFamily: 'DMSans-Bold', marginTop: 10 },
  permDesc: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    marginBottom: 20,
  },

  // Review
  reviewScroll: { paddingHorizontal: Spacing.md, paddingTop: 8 },
  previewImage: {
    width: '100%',
    height: 240,
    borderRadius: BorderRadius.lg,
    marginBottom: 12,
  },
  analyzingBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  analyzingText: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 8,
    marginLeft: 4,
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
  matchName: { fontSize: 14, fontFamily: 'DMSans-SemiBold' },
  matchMeta: { fontSize: 11, fontFamily: 'DMSans-Regular', marginTop: 2 },
  noResults: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    marginTop: 12,
  },

  // Primary button
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
  },
  primaryBtnText: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
