/**
 * Meal Scan — capture a plate of food and detect items with AI vision.
 *
 * Route: /nutrition/meal-scan
 *
 * MVP behavior:
 *   1. Camera viewfinder via expo-camera
 *   2. User taps shutter → capture photo
 *   3. Detection runs the `food-scan` edge function (Grok/OpenAI vision)
 *   4. Each detected item keeps the model's portion + macro estimates
 *      directly; only items the model couldn't macro-fill fall back to a
 *      searchAllFoods() database match.
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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { PaywallGate } from '../../src/hooks/useFeatureGate';
import { Spacing, BorderRadius, Colors } from '../../src/constants/theme';
import { searchAllFoods, calcUnifiedMacros, type UnifiedFood } from '../../src/services/foodSearchService';
import { useMealStore } from '../../src/store/useMealStore';
import type { MealType } from '../../src/types/fitness';
import { ensureAiConsent } from '../../src/utils/ensureAiConsent';
import { clamp, clampString } from '../../src/utils/aimeeActionSanitize';

const today = () => new Date().toISOString().slice(0, 10);

// Raw per-item shape returned by the `food-scan` edge function (vision model).
interface ScanItem {
  name?: string;
  estimatedGrams?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}

// Sanitized, UI-ready item carrying the macros we'll actually log.
interface ScannedFood {
  id: string;
  name: string;
  grams: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
}

const inferMealType = (): MealType => {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snack';
  return 'dinner';
};

// Discriminated outcome of a scan so the caller can tell apart a true
// "vision saw nothing" (empty) from failures that retaking the photo can't
// fix — a network/auth/base64 error, or the user declining AI consent.
// Previously every one of these collapsed into [] and the UI told the user
// to "try better lighting", which is wrong for offline/401/5xx/consent.
type DetectResult =
  | { status: 'ok'; items: ScanItem[] }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'no_consent' };

// Detects foods in a photo by calling the `food-scan` Supabase edge function,
// which passes the image to vision and returns the identified items WITH
// per-item portion + macro estimates. We return the full item objects so the
// caller can log those accurate macros directly instead of re-searching the
// database (which threw away the model's estimates and produced generic rows).
async function detectFoodsFromPhoto(photoUri: string): Promise<DetectResult> {
  // App Review 5.1.2: explicit consent before sending the photo to the vision model.
  if (!(await ensureAiConsent())) return { status: 'no_consent' };
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

    // Edge function returns { items: [{ name, estimatedGrams, calories,
    // protein, carbs, fat, fiber }], totals, description }. Keep the whole
    // item — the macros are the whole point of the scan.
    if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
      const items = (data.items as ScanItem[]).filter((f) => f?.name);
      return items.length > 0 ? { status: 'ok', items } : { status: 'empty' };
    }
    // Vision ran but saw nothing recognizable — retaking can actually help.
    return { status: 'empty' };
  } catch (err) {
    if (__DEV__) {
      console.warn('[meal-scan] vision detection failed:', err);
    }
    // Network / auth / base64 failure — retaking the photo won't help.
    return { status: 'error' };
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
  const [matches, setMatches] = useState<ScannedFood[]>([]);
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

  // ── Shared analysis path ──
  // Both the live camera capture and the "Choose from library" picker feed
  // their resulting photo URI in here, so the detection + macro-mapping
  // logic lives in exactly one place.
  const analyzePhoto = async (uri: string) => {
    try {
      setPhotoUri(uri);
      setAnalyzing(true);

      // 1. Detect foods (with macros) via vision
      const detected = await detectFoodsFromPhoto(uri);
      if (!mountedRef.current) return;

      // Failures that retaking can't fix — bounce back to the camera with a
      // message that matches the real cause instead of "better lighting".
      if (detected.status === 'no_consent') {
        Alert.alert(
          'AI features off',
          'Turn on AI features to scan your meal. You can agree the next time you scan.',
        );
        setPhotoUri(null);
        return;
      }
      if (detected.status === 'error') {
        Alert.alert(
          'Couldn\'t scan',
          'Couldn\'t reach the scanner — check your connection and try again.',
        );
        setPhotoUri(null);
        return;
      }
      if (detected.status === 'empty') {
        // True zero-detections — this is the only case where retaking with a
        // clearer angle / better lighting can actually help.
        Alert.alert(
          'Nothing recognized',
          'We couldn\'t identify any foods in that photo. Try a clearer angle or better lighting.',
        );
        return;
      }

      // 2. Build the review list. The vision model already returns an
      //    accurate portion + macros per item, so we keep those directly
      //    (clamped — the model can hallucinate any value, same caps as
      //    food-scanner.tsx / sanitizeLogMeal). Only when an item comes
      //    back with no usable calories do we fall back to a database
      //    search so the row still has *some* macros.
      const items = detected.items;
      const all: ScannedFood[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const name = clampString(item.name, 200);
        if (!name) continue;

        const hasMacros = Number.isFinite(Number(item.calories)) && Number(item.calories) > 0;
        if (hasMacros) {
          all.push({
            id: `scan-${Date.now()}-${i}`,
            name,
            grams: clamp(item.estimatedGrams, 5000),
            calories: clamp(item.calories, 3000),
            proteinGrams: clamp(item.protein, 300),
            carbsGrams: clamp(item.carbs, 500),
            fatGrams: clamp(item.fat, 300),
            fiberGrams: clamp(item.fiber, 100),
          });
          continue;
        }

        // Fallback: model gave us a name but no macros — search the DB.
        const results = await searchAllFoods(name, { limit: 3 });
        if (!mountedRef.current) return;
        if (results.length > 0) {
          const food: UnifiedFood = results[0];
          const grams = food.defaultServingGrams || 100;
          const macros = calcUnifiedMacros(food, grams);
          all.push({
            id: food.id,
            name: `${food.name}${food.brand ? ` (${food.brand})` : ''}`,
            grams,
            calories: macros.calories,
            proteinGrams: macros.proteinGrams,
            carbsGrams: macros.carbsGrams,
            fatGrams: macros.fatGrams,
            fiberGrams: macros.fiberGrams ?? 0,
          });
        }
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

  // ── Live camera capture ──
  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: false });
      if (!mountedRef.current) return;
      if (!photo?.uri) return;
      await analyzePhoto(photo.uri);
    } catch (err) {
      if (mountedRef.current) {
        Alert.alert('Capture failed', 'Could not capture the photo.');
      }
    }
  };

  // ── Choose an existing photo (parity with lab / pantry scanners) ──
  const handlePickFromLibrary = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      // Android's library uses the system Photo Picker, which needs no
      // permission — a non-granted result there must NOT block. iOS still
      // requires the library permission.
      if (!perm.granted && Platform.OS !== 'android') {
        Alert.alert(
          'Photos access needed',
          'Allow photo library access in Settings to choose a meal photo.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
          ],
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      if (!mountedRef.current) return;
      await analyzePhoto(result.assets[0].uri);
    } catch (err) {
      if (mountedRef.current) {
        Alert.alert('Couldn\'t open library', 'Could not open your photo library. Please try again.');
      }
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
    // Log the AI's per-item portion + macros directly (already clamped at
    // capture time). No re-search — that's exactly what was throwing away
    // the vision model's accurate estimates.
    const foods = toLog.map((food) => {
      const grams = Math.round(food.grams);
      return {
        foodId: food.id,
        foodName: `${food.name} — ${grams}g`,
        servings: 1,
        calories: food.calories,
        proteinGrams: food.proteinGrams,
        carbsGrams: food.carbsGrams,
        fatGrams: food.fatGrams,
        fiberGrams: food.fiberGrams,
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

          {/* Shutter + library picker */}
          <View style={s.shutterRow}>
            <View style={s.shutterSideSlot} />
            <TouchableOpacity
              style={s.shutterBtn}
              onPress={handleCapture}
              activeOpacity={0.8}
            >
              <View style={s.shutterInner} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.shutterSideSlot, s.libraryBtn]}
              onPress={handlePickFromLibrary}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Choose from library"
            >
              <Ionicons name="images-outline" size={26} color="#fff" />
              <Text style={s.libraryBtnText}>Library</Text>
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
                const grams = Math.round(food.grams);
                const cal = Math.round(food.calories);
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

  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  shutterSideSlot: { width: 64, alignItems: 'center', justifyContent: 'center' },
  libraryBtn: { gap: 2 },
  libraryBtnText: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 4,
  },
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
