/**
 * Food Scanner — Take a photo of your meal, AI identifies contents and macros.
 * Pro tier only.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GlassCard } from '../../src/components/GlassCard';
import { AnimatedPress } from '../../src/components/AnimatedPress';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../src/constants/theme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import { useMealStore } from '../../src/store/useMealStore';
import { supabase } from '../../src/services/supabase';
import { trackFeatureGated } from '../../src/services/analyticsEvents';
import { clamp, clampString } from '../../src/utils/aimeeActionSanitize';
import { AskAimeeButton } from '../../src/components/AskAimeeButton';
import { ensureAiConsent } from '../../src/utils/ensureAiConsent';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

interface FoodItem {
  name: string;
  estimatedGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

// ─── Traffic-light scoring ────────────────────────────────────────────────
// Plain-English signal pulled from the macro fields already on the scan
// result — no new data. We only have calories / protein / carbs / fat /
// fiber from the vision endpoint, so the heuristic is intentionally
// conservative and defensible:
//
//   Green  → solid pick: protein dense (>=15g) OR (>=8g protein with >=3g fiber)
//   Yellow → fine, in moderation: anything that isn't green and isn't red
//   Red    → indulgence: low protein (<4g) AND high fat (>=15g)
//                        OR very low protein (<2g) with high carbs (>=30g)
//
// "Reasonable default" maps to yellow so we never falsely label an item
// green/red without a clear signal.
type FoodSignal = 'green' | 'yellow' | 'red';

function scoreFoodItem(item: FoodItem): FoodSignal {
  const lowProtein = item.protein < 4;
  const veryLowProtein = item.protein < 2;
  const highFat = item.fat >= 15;
  const highCarbs = item.carbs >= 30;
  if ((lowProtein && highFat) || (veryLowProtein && highCarbs)) return 'red';
  if (item.protein >= 15 || (item.protein >= 8 && item.fiber >= 3)) return 'green';
  return 'yellow';
}

const SIGNAL_META: Record<FoodSignal, { color: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  green: { color: '#22c55e', label: 'Solid pick', icon: 'checkmark-circle' },
  yellow: { color: '#F4B942', label: 'Fine, in moderation', icon: 'remove-circle' },
  red: { color: '#ef4444', label: 'Save it for sometimes', icon: 'alert-circle' },
};

interface ScanResult {
  description: string;
  items: FoodItem[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
}

export default function FoodScannerScreen() {
  const router = useRouter();
  const accent = useSectionAccent();
  const tier = useSubscriptionStore((s) => s.tier);
  // Wave 76.35: use hasFeature instead of a hardcoded `tier !== 'pro'`.
  // (1) Server-side food-scan allows plus + pro, client was stricter.
  // (2) hasFeature() has the TestFlight preview-build bypass — without
  // it, every TestFlight tester got the upgrade wall and never reached
  // the camera, which is why testers reported "no camera features work".
  const canUseFoodScanner = useSubscriptionStore((s) => s.hasFeature('ai_food_scanner'));
  const addMeal = useMealStore((s) => s.addMeal);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string>('lunch');

  // 30s vision round-trip can outlive the screen if the user navigates
  // back mid-scan. Guard every post-await setState.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Gate: Pro only — fire feature_gated analytics so paywall funnel data is
  // complete (matches what <PaywallGate> does for other Pro screens).
  React.useEffect(() => {
    if (!canUseFoodScanner) trackFeatureGated('ai_food_scanner', tier);
  }, [canUseFoodScanner, tier]);

  if (!canUseFoodScanner) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPress onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
          </AnimatedPress>
          <Text style={styles.headerTitle}>Food Scanner</Text>
        </View>
        <View style={styles.locked}>
          <Ionicons name="camera" size={48} color={Colors.darkTextSecondary} />
          <Text style={styles.lockedTitle}>Plus Feature</Text>
          <Text style={styles.lockedText}>
            Snap a plate — PepTalk identifies every food and logs the macros instantly. Available with PepTalk+.
          </Text>
          <AnimatedPress onPress={() => router.push('/subscription')}>
            <LinearGradient colors={[accent.deep, accent.darker]} style={styles.upgradeBtn}>
              <Text style={styles.upgradeBtnText}>Upgrade to Plus</Text>
            </LinearGradient>
          </AnimatedPress>
        </View>
      </SafeAreaView>
    );
  }

  // Camera permissions
  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPress onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
          </AnimatedPress>
          <Text style={styles.headerTitle}>Food Scanner</Text>
        </View>
        <View style={styles.locked}>
          <Ionicons name="camera-outline" size={48} color={accent.deep} />
          <Text style={styles.lockedTitle}>Camera Access Needed</Text>
          <Text style={styles.lockedText}>
            Allow camera access to scan your meals and automatically calculate nutrition.
          </Text>
          {/* 2026-05-17 a11y fix: route to Settings when OS won't prompt again. */}
          <AnimatedPress
            onPress={() => {
              if (permission?.canAskAgain ?? true) {
                requestPermission();
              } else {
                Linking.openSettings().catch(() => {});
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={(permission?.canAskAgain ?? true) ? 'Enable camera' : 'Open settings to enable camera'}
          >
            <LinearGradient colors={[accent.deep, accent.deep]} style={styles.upgradeBtn}>
              <Text style={styles.upgradeBtnText}>
                {(permission?.canAskAgain ?? true) ? 'Enable Camera' : 'Open Settings'}
              </Text>
            </LinearGradient>
          </AnimatedPress>
        </View>
      </SafeAreaView>
    );
  }

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      // quality 0.4 keeps base64 payload under ~1-2MB on 12MP cameras —
      // plenty for vision recognition and well under the 6MB edge-function limit.
      const pic = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.4,
        exif: false,
      });
      if (pic?.base64) {
        // Rough size guard: base64 is ~4/3 the binary size; > ~5MB base64 will
        // start hitting edge-function / fetch limits on slow connections.
        if (pic.base64.length > 5_000_000) {
          Alert.alert(
            'Photo too large',
            'Please retake the photo — your camera produced an image too large to analyze.',
          );
          return;
        }
        setPhoto(`data:image/jpeg;base64,${pic.base64}`);
        analyzeFoodPhoto(pic.base64);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const analyzeFoodPhoto = async (base64: string) => {
    // App Review 5.1.2: explicit consent before sending the photo to the vision model.
    if (!(await ensureAiConsent())) return;
    setScanning(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mountedRef.current) return;
      if (!session?.access_token) {
        Alert.alert('Error', 'Please log in to use the food scanner.');
        setScanning(false);
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/food-scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!mountedRef.current) return;

      if (!res.ok) {
        const data = await res.json();
        Alert.alert('Scan Failed', data.error || 'Could not analyze the photo.');
        setScanning(false);
        return;
      }

      const data: ScanResult = await res.json();
      if (!mountedRef.current) return;
      setResult(data);
    } catch (e) {
      if (mountedRef.current) {
        Alert.alert('Error', 'Network error. Please try again.');
      }
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  };

  const logMeal = () => {
    if (!result) return;

    const today = new Date().toISOString().slice(0, 10);
    // Clamp every LLM-emitted item — vision model can hallucinate any
    // value, and these foods land directly in the daily ring. Same
    // per-row caps as sanitizeLogMeal so the scan surface can't bypass
    // the chat sanitize pipeline.
    addMeal({
      id: `scan-${Date.now()}`,
      date: today,
      mealType: selectedMealType as any,
      foods: result.items.slice(0, 20).map((item, i) => ({
        foodId: `scan-${Date.now()}-${i}`,
        foodName: clampString(item.name, 200) || 'item',
        servings: 1,
        calories: clamp(item.calories, 3000),
        proteinGrams: clamp(item.protein, 300),
        carbsGrams: clamp(item.carbs, 500),
        fatGrams: clamp(item.fat, 300),
      })),
      notes: `Scanned: ${clampString(result.description, 400)}`,
      timestamp: new Date().toISOString(),
    });

    Alert.alert('Logged!', `${result.description} added to your ${selectedMealType}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const retake = () => {
    setPhoto(null);
    setResult(null);
  };

  const MEAL_TYPES = [
    { key: 'breakfast', label: 'Breakfast', icon: 'sunny-outline' },
    { key: 'lunch', label: 'Lunch', icon: 'restaurant-outline' },
    { key: 'dinner', label: 'Dinner', icon: 'moon-outline' },
    { key: 'snack', label: 'Snack', icon: 'cafe-outline' },
  ];

  // ── Camera View ──
  if (!photo) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <SafeAreaView style={styles.cameraOverlay} edges={['top']}>
            <View style={styles.cameraHeader}>
              <AnimatedPress onPress={() => router.back()} style={styles.cameraBackBtn}>
                <Ionicons name="close" size={24} color="#fff" />
              </AnimatedPress>
              <Text style={styles.cameraTitle}>Scan Your Meal</Text>
              <View style={{ width: 40 }} />
            </View>
          </SafeAreaView>

          <View style={styles.cameraBottom}>
            <Text style={styles.cameraHint}>
              Center your plate or bowl in the frame
            </Text>
            <AnimatedPress onPress={takePhoto} style={styles.shutterBtn}>
              <View style={styles.shutterInner} />
            </AnimatedPress>
          </View>
        </CameraView>
      </View>
    );
  }

  // ── Results View ──
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPress onPress={retake} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </AnimatedPress>
        <Text style={styles.headerTitle}>Scan Results</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Photo preview */}
        <View style={styles.photoPreview}>
          <Image source={{ uri: photo }} style={styles.photoImage} />
        </View>

        {scanning && (
          <GlassCard style={styles.scanningCard}>
            <ActivityIndicator size="large" color={accent.deep} />
            <Text style={styles.scanningText}>Aimee is analyzing your meal...</Text>
          </GlassCard>
        )}

        {result && (
          <>
            {/* Description */}
            <GlassCard variant="elevated" style={styles.descCard}>
              <Text style={styles.descText}>{result.description}</Text>
            </GlassCard>

            {/* Totals */}
            <View style={styles.totalsRow}>
              <GlassCard style={styles.totalCard}>
                <Text style={styles.totalValue}>{result.totals.calories}</Text>
                <Text style={styles.totalLabel}>Cal</Text>
              </GlassCard>
              <GlassCard style={styles.totalCard}>
                <Text style={[styles.totalValue, { color: accent.deep }]}>{result.totals.protein}g</Text>
                <Text style={styles.totalLabel}>Protein</Text>
              </GlassCard>
              <GlassCard style={styles.totalCard}>
                <Text style={[styles.totalValue, { color: accent.pastel }]}>{result.totals.carbs}g</Text>
                <Text style={styles.totalLabel}>Carbs</Text>
              </GlassCard>
              <GlassCard style={styles.totalCard}>
                <Text style={[styles.totalValue, { color: '#ef4444' }]}>{result.totals.fat}g</Text>
                <Text style={styles.totalLabel}>Fat</Text>
              </GlassCard>
            </View>

            {/* Individual items — leads with a traffic-light badge based
                on the macro signal (see scoreFoodItem) so users get a
                plain-English read on each item before the gram counts.
                Macros drop to a smaller second line. */}
            <Text style={styles.sectionTitle}>Identified Foods</Text>
            {result.items.map((item, i) => {
              const signal = scoreFoodItem(item);
              const meta = SIGNAL_META[signal];
              return (
                <GlassCard key={i} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemHeaderLeft}>
                      <View
                        style={[styles.signalBadge, { backgroundColor: `${meta.color}1F`, borderColor: `${meta.color}55` }]}
                        accessibilityLabel={`${meta.label} food`}
                        accessibilityRole="text"
                      >
                        <Ionicons name={meta.icon} size={14} color={meta.color} />
                        <Text style={[styles.signalText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                      <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                    </View>
                    <Text style={styles.itemGrams}>~{item.estimatedGrams}g</Text>
                  </View>
                  <View style={styles.itemMacros}>
                    <Text style={styles.itemMacro}>{item.calories} cal</Text>
                    <Text style={[styles.itemMacro, { color: accent.deep }]}>P {item.protein}g</Text>
                    <Text style={[styles.itemMacro, { color: accent.pastel }]}>C {item.carbs}g</Text>
                    <Text style={[styles.itemMacro, { color: '#ef4444' }]}>F {item.fat}g</Text>
                  </View>
                </GlassCard>
              );
            })}

            {/* Ask Aimee — escape hatch for "is this a good choice for my
                goals?" Lives below the items list so the user has the
                context of the scan results already in their head. */}
            <View style={styles.aimeeRow}>
              <AskAimeeButton
                prefill="Is this a good choice for my goals?"
                accessibilityLabel="Ask Aimee whether this meal fits your goals"
              />
            </View>

            {/* Meal type picker */}
            <Text style={styles.sectionTitle}>Log as</Text>
            <View style={styles.mealTypeRow}>
              {MEAL_TYPES.map((mt) => (
                <AnimatedPress
                  key={mt.key}
                  onPress={() => setSelectedMealType(mt.key)}
                  style={[
                    styles.mealTypeBtn,
                    selectedMealType === mt.key && styles.mealTypeBtnActive,
                  ]}
                >
                  <Ionicons
                    name={mt.icon as any}
                    size={16}
                    color={selectedMealType === mt.key ? accent.deep : Colors.darkTextSecondary}
                  />
                  <Text style={[
                    styles.mealTypeText,
                    selectedMealType === mt.key && styles.mealTypeTextActive,
                  ]}>
                    {mt.label}
                  </Text>
                </AnimatedPress>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <AnimatedPress onPress={logMeal}>
                <LinearGradient
                  colors={['#22c55e', '#16a34a']}
                  style={styles.logBtn}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.logBtnText}>Log This Meal</Text>
                </LinearGradient>
              </AnimatedPress>

              <AnimatedPress onPress={retake} style={styles.retakeBtn}>
                <Ionicons name="camera-outline" size={18} color={Colors.darkTextSecondary} />
                <Text style={styles.retakeBtnText}>Retake Photo</Text>
              </AnimatedPress>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: Colors.darkText },
  scroll: { paddingHorizontal: Spacing.lg },

  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: { flex: 0 },
  cameraHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  cameraBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: '#fff' },
  cameraBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', paddingBottom: 50,
  },
  cameraHint: {
    fontSize: FontSizes.sm, color: 'rgba(0,0,0,0.50)',
    marginBottom: Spacing.lg, textAlign: 'center',
  },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#fff',
  },

  // Photo preview
  photoPreview: {
    height: 200, borderRadius: BorderRadius.lg,
    overflow: 'hidden', marginBottom: Spacing.md,
  },
  photoImage: { width: '100%', height: '100%' },

  // Scanning
  scanningCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  scanningText: { fontSize: FontSizes.md, color: Colors.darkTextSecondary },

  // Description
  descCard: { marginBottom: Spacing.md },
  descText: { fontSize: FontSizes.lg, fontWeight: '600', color: Colors.darkText, textAlign: 'center' },

  // Totals
  totalsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  totalCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  totalValue: { fontSize: FontSizes.xl, fontWeight: '800', color: Colors.darkText },
  totalLabel: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginTop: 2 },

  // Items
  sectionTitle: {
    fontSize: FontSizes.sm, fontWeight: '600', color: Colors.darkTextSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
    marginTop: Spacing.sm, marginBottom: Spacing.sm,
  },
  itemCard: { marginBottom: Spacing.xs, paddingVertical: Spacing.sm },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  itemHeaderLeft: { flex: 1, gap: 4 },
  itemName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText },
  itemGrams: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginLeft: 8, marginTop: 4 },
  itemMacros: { flexDirection: 'row', gap: Spacing.md },
  itemMacro: { fontSize: 11, fontWeight: '500', color: Colors.darkTextSecondary },
  signalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  signalText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  aimeeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: Spacing.md,
  },

  // Meal type
  mealTypeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  mealTypeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  mealTypeBtnActive: { borderColor: Colors.almostAquaDeep, backgroundColor: Colors.almostAquaDeep + '18' },
  mealTypeText: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, fontWeight: '500' },
  mealTypeTextActive: { color: Colors.almostAquaDeep },

  // Actions
  actions: { gap: Spacing.sm },
  logBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    height: 52, borderRadius: BorderRadius.md,
  },
  logBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    height: 44, borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  retakeBtnText: { color: Colors.darkTextSecondary, fontSize: FontSizes.sm, fontWeight: '500' },

  // Locked
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  lockedTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: Colors.darkText },
  lockedText: { fontSize: FontSizes.md, color: Colors.darkTextSecondary, textAlign: 'center' },
  upgradeBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, marginTop: Spacing.sm },
  upgradeBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
});
