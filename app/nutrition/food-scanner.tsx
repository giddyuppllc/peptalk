/**
 * Food Scanner — Take a photo of your meal, AI identifies contents and macros.
 * Pro tier only.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GlassCard } from '../../src/components/GlassCard';
import { AnimatedPress } from '../../src/components/AnimatedPress';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { tapMedium, notifySuccess } from '../../src/utils/haptics';
import { useSubscriptionStore } from '../../src/store/useSubscriptionStore';
import { useMealStore } from '../../src/store/useMealStore';
import { supabase } from '../../src/services/supabase';
import { trackFeatureGated } from '../../src/services/analyticsEvents';
import { clamp, clampString } from '../../src/utils/aimeeActionSanitize';
import { AskAimeeButton } from '../../src/components/AskAimeeButton';
import { ensureAiConsent } from '../../src/utils/ensureAiConsent';
import { todayLocalISO } from '../../src/utils/dateUtil';

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
  const t = useTheme();
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
  // Inline correction: the vision model can misidentify an item (e.g. a
  // beef stick read as "creamer"). Let the user fix name + macros before
  // it lands in the daily ring, instead of logging a wrong guess silently.
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<FoodItem | null>(null);

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
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
        <StatusBar style={t.statusBar} />
        <View style={styles.header}>
          <AnimatedPress onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: t.surface }]} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={t.text} />
          </AnimatedPress>
          <Text style={[styles.headerTitle, { color: t.text }]}>Food Scanner</Text>
        </View>
        <View style={styles.locked}>
          <Ionicons name="camera" size={48} color={t.textMuted} />
          <Text style={[styles.lockedTitle, { color: t.text }]}>Plus Feature</Text>
          <Text style={[styles.lockedText, { color: t.textSecondary }]}>
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
      <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
        <StatusBar style={t.statusBar} />
        <View style={styles.header}>
          <AnimatedPress onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: t.surface }]} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={t.text} />
          </AnimatedPress>
          <Text style={[styles.headerTitle, { color: t.text }]}>Food Scanner</Text>
        </View>
        <View style={styles.locked}>
          <Ionicons name="camera-outline" size={48} color={accent.deep} />
          <Text style={[styles.lockedTitle, { color: t.text }]}>Camera Access Needed</Text>
          <Text style={[styles.lockedText, { color: t.textSecondary }]}>
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
    tapMedium();
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

  // Choose an existing photo instead of the live camera (parity with the
  // lab / pantry scanners). Feeds the picked image into the SAME
  // analyzeFoodPhoto() path the camera capture uses.
  const pickFromLibrary = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      // Android's library uses the system Photo Picker, which needs no
      // permission — a non-granted result there must NOT block. iOS still
      // requires the library permission.
      if (!perm.granted && Platform.OS !== 'android') {
        Alert.alert(
          'Photos access needed',
          'Allow photo library access in Settings to scan an existing photo.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
          ],
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.4,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Error', 'Could not read that photo. Please try another.');
        return;
      }
      if (asset.base64.length > 5_000_000) {
        Alert.alert(
          'Photo too large',
          'Please choose a smaller photo — that one is too large to analyze.',
        );
        return;
      }
      setPhoto(`data:image/jpeg;base64,${asset.base64}`);
      analyzeFoodPhoto(asset.base64);
    } catch (e) {
      Alert.alert('Error', 'Could not open your photo library. Please try again.');
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
        Alert.alert('Scan Failed', data.error || 'Aimee couldn\'t analyze the photo.');
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

    const today = todayLocalISO();
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

    notifySuccess();
    Alert.alert('Logged!', `${result.description} added to your ${selectedMealType}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const retake = () => {
    setPhoto(null);
    setResult(null);
  };

  // ── Inline item editing ──
  const openEditor = (i: number) => {
    if (!result) return;
    tapMedium();
    setEditIndex(i);
    setDraft({ ...result.items[i] });
  };

  const closeEditor = () => {
    setEditIndex(null);
    setDraft(null);
  };

  // Numeric fields: strip non-numeric input, clamp to >= 0, keep as number.
  const setDraftNum = (key: 'calories' | 'protein' | 'carbs' | 'fat', v: string) => {
    const n = Math.max(0, Number(v.replace(/[^0-9.]/g, '')) || 0);
    setDraft((d) => (d ? { ...d, [key]: n } : d));
  };

  const recomputeTotals = (items: FoodItem[]): ScanResult['totals'] =>
    items.reduce(
      (acc, it) => ({
        calories: acc.calories + (Number(it.calories) || 0),
        protein: acc.protein + (Number(it.protein) || 0),
        carbs: acc.carbs + (Number(it.carbs) || 0),
        fat: acc.fat + (Number(it.fat) || 0),
        fiber: acc.fiber + (Number(it.fiber) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );

  const saveEdit = () => {
    if (editIndex === null || !draft || !result) return;
    const items = result.items.map((it, i) => (i === editIndex ? draft : it));
    setResult({ ...result, items, totals: recomputeTotals(items) });
    closeEditor();
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
            <AnimatedPress
              onPress={pickFromLibrary}
              style={styles.libraryBtn}
              accessibilityRole="button"
              accessibilityLabel="Choose from library"
            >
              <Ionicons name="images-outline" size={20} color="#fff" />
              <Text style={styles.libraryBtnText}>Choose from library</Text>
            </AnimatedPress>
          </View>
        </CameraView>
      </View>
    );
  }

  // ── Results View ──
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <StatusBar style={t.statusBar} />
      <View style={styles.header}>
        <AnimatedPress onPress={retake} style={[styles.backBtn, { backgroundColor: t.surface }]}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </AnimatedPress>
        <Text style={[styles.headerTitle, { color: t.text }]}>Scan Results</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Photo preview */}
        <View style={styles.photoPreview}>
          <Image source={{ uri: photo }} style={styles.photoImage} />
        </View>

        {scanning && (
          <GlassCard style={styles.scanningCard}>
            <ActivityIndicator size="large" color={accent.deep} />
            <Text style={[styles.scanningText, { color: t.textSecondary }]}>Aimee is analyzing your plate…</Text>
          </GlassCard>
        )}

        {result && (
          <>
            {/* Description */}
            <GlassCard variant="elevated" style={styles.descCard}>
              <Text style={[styles.descText, { color: t.text }]}>{result.description}</Text>
            </GlassCard>

            {/* Totals */}
            <View style={styles.totalsRow}>
              <GlassCard style={styles.totalCard}>
                <Text style={[styles.totalValue, { color: t.text }]}>{result.totals.calories}</Text>
                <Text style={[styles.totalLabel, { color: t.textSecondary }]}>Cal</Text>
              </GlassCard>
              <GlassCard style={styles.totalCard}>
                <Text style={[styles.totalValue, { color: accent.deep }]}>{result.totals.protein}g</Text>
                <Text style={[styles.totalLabel, { color: t.textSecondary }]}>Protein</Text>
              </GlassCard>
              <GlassCard style={styles.totalCard}>
                <Text style={[styles.totalValue, { color: accent.pastel }]}>{result.totals.carbs}g</Text>
                <Text style={[styles.totalLabel, { color: t.textSecondary }]}>Carbs</Text>
              </GlassCard>
              <GlassCard style={styles.totalCard}>
                <Text style={[styles.totalValue, { color: '#ef4444' }]}>{result.totals.fat}g</Text>
                <Text style={[styles.totalLabel, { color: t.textSecondary }]}>Fat</Text>
              </GlassCard>
            </View>

            {/* Individual items — leads with a traffic-light badge based
                on the macro signal (see scoreFoodItem) so users get a
                plain-English read on each item before the gram counts.
                Macros drop to a smaller second line. */}
            <Text style={[styles.sectionTitle, { color: t.textSecondary }]}>Identified Foods</Text>
            <Text style={[styles.editHint, { color: t.textSecondary }]}>
              Wrong guess? Tap an item to fix its name or macros before logging.
            </Text>
            {result.items.map((item, i) => {
              const signal = scoreFoodItem(item);
              const meta = SIGNAL_META[signal];
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.7}
                  onPress={() => openEditor(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name}`}
                  accessibilityHint="Opens an editor to correct the name and macros"
                >
                  <GlassCard style={styles.itemCard}>
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
                        <Text style={[styles.itemName, { color: t.text }]} numberOfLines={2}>{item.name}</Text>
                      </View>
                      <View style={styles.itemHeaderRight}>
                        <Text style={[styles.itemGrams, { color: t.textSecondary }]}>~{item.estimatedGrams}g</Text>
                        <Ionicons name="pencil" size={14} color={t.textSecondary} style={styles.itemEditIcon} />
                      </View>
                    </View>
                    <View style={styles.itemMacros}>
                      <Text style={[styles.itemMacro, { color: t.textSecondary }]}>{item.calories} cal</Text>
                      <Text style={[styles.itemMacro, { color: accent.deep }]}>P {item.protein}g</Text>
                      <Text style={[styles.itemMacro, { color: accent.pastel }]}>C {item.carbs}g</Text>
                      <Text style={[styles.itemMacro, { color: '#ef4444' }]}>F {item.fat}g</Text>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
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
            <Text style={[styles.sectionTitle, { color: t.textSecondary }]}>Log as</Text>
            <View style={styles.mealTypeRow}>
              {MEAL_TYPES.map((mt) => (
                <AnimatedPress
                  key={mt.key}
                  onPress={() => setSelectedMealType(mt.key)}
                  style={[
                    styles.mealTypeBtn,
                    { backgroundColor: t.surface, borderColor: t.cardBorder },
                    selectedMealType === mt.key && styles.mealTypeBtnActive,
                  ]}
                >
                  <Ionicons
                    name={mt.icon as any}
                    size={16}
                    color={selectedMealType === mt.key ? accent.deep : t.textSecondary}
                  />
                  <Text style={[
                    styles.mealTypeText,
                    { color: t.textSecondary },
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

              <AnimatedPress onPress={retake} style={[styles.retakeBtn, { backgroundColor: t.surface }]}>
                <Ionicons name="camera-outline" size={18} color={t.textSecondary} />
                <Text style={[styles.retakeBtnText, { color: t.textSecondary }]}>Retake Photo</Text>
              </AnimatedPress>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Inline item editor — correct a misidentified item before logging. */}
      <Modal
        visible={editIndex !== null && !!draft}
        transparent
        animationType="fade"
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Edit item</Text>

            <Text style={[styles.editLabel, { color: t.textSecondary }]}>Name</Text>
            <TextInput
              value={draft?.name ?? ''}
              onChangeText={(v) => setDraft((d) => (d ? { ...d, name: v } : d))}
              placeholder="Food name"
              placeholderTextColor={t.textMuted}
              style={[styles.editInput, { color: t.text, backgroundColor: t.bg, borderColor: t.cardBorder }]}
              maxLength={200}
            />

            <View style={styles.editRow}>
              <View style={styles.editCol}>
                <Text style={[styles.editLabel, { color: t.textSecondary }]}>Calories</Text>
                <TextInput
                  value={String(draft?.calories ?? 0)}
                  onChangeText={(v) => setDraftNum('calories', v)}
                  keyboardType="numeric"
                  style={[styles.editInput, { color: t.text, backgroundColor: t.bg, borderColor: t.cardBorder }]}
                />
              </View>
              <View style={styles.editCol}>
                <Text style={[styles.editLabel, { color: t.textSecondary }]}>Protein (g)</Text>
                <TextInput
                  value={String(draft?.protein ?? 0)}
                  onChangeText={(v) => setDraftNum('protein', v)}
                  keyboardType="numeric"
                  style={[styles.editInput, { color: t.text, backgroundColor: t.bg, borderColor: t.cardBorder }]}
                />
              </View>
            </View>

            <View style={styles.editRow}>
              <View style={styles.editCol}>
                <Text style={[styles.editLabel, { color: t.textSecondary }]}>Carbs (g)</Text>
                <TextInput
                  value={String(draft?.carbs ?? 0)}
                  onChangeText={(v) => setDraftNum('carbs', v)}
                  keyboardType="numeric"
                  style={[styles.editInput, { color: t.text, backgroundColor: t.bg, borderColor: t.cardBorder }]}
                />
              </View>
              <View style={styles.editCol}>
                <Text style={[styles.editLabel, { color: t.textSecondary }]}>Fat (g)</Text>
                <TextInput
                  value={String(draft?.fat ?? 0)}
                  onChangeText={(v) => setDraftNum('fat', v)}
                  keyboardType="numeric"
                  style={[styles.editInput, { color: t.text, backgroundColor: t.bg, borderColor: t.cardBorder }]}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={closeEditor}
                style={[styles.modalBtn, { backgroundColor: t.bg, borderColor: t.cardBorder, borderWidth: 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
              >
                <Text style={[styles.modalBtnText, { color: t.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveEdit}
                style={[styles.modalBtn, { backgroundColor: accent.deep }]}
                accessibilityRole="button"
                accessibilityLabel="Save item changes"
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  libraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  libraryBtnText: { color: '#fff', fontSize: FontSizes.sm, fontWeight: '600' },

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
  itemHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  itemEditIcon: { marginTop: 4 },
  itemName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText },
  itemGrams: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, marginTop: 4 },
  editHint: { fontSize: FontSizes.xs, marginBottom: Spacing.sm, marginTop: -Spacing.xs },
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

  // Edit modal
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', padding: Spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 420, borderRadius: BorderRadius.lg,
    borderWidth: 1, padding: Spacing.lg, gap: Spacing.xs,
  },
  modalTitle: { fontSize: FontSizes.lg, fontWeight: '700', marginBottom: Spacing.sm },
  editLabel: { fontSize: FontSizes.xs, fontWeight: '600', marginBottom: 4, marginTop: Spacing.xs },
  editInput: {
    borderWidth: 1, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
  },
  editRow: { flexDirection: 'row', gap: Spacing.sm },
  editCol: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  modalBtn: {
    flex: 1, height: 46, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnText: { fontSize: FontSizes.md, fontWeight: '700' },

  // Locked
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  lockedTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: Colors.darkText },
  lockedText: { fontSize: FontSizes.md, color: Colors.darkTextSecondary, textAlign: 'center' },
  upgradeBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, marginTop: Spacing.sm },
  upgradeBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },
});
