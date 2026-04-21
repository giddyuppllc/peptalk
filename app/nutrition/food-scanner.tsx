/**
 * Food Scanner — Take a photo of your meal, AI identifies contents and macros.
 * Pro tier only.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
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
  const addMeal = useMealStore((s) => s.addMeal);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string>('lunch');

  // Gate: Pro only
  if (tier !== 'pro') {
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
          <Text style={styles.lockedTitle}>Pro Feature</Text>
          <Text style={styles.lockedText}>
            AI food scanning with automatic macro calculation is available with PepTalk Pro.
          </Text>
          <AnimatedPress onPress={() => router.push('/subscription')}>
            <LinearGradient colors={[accent.deep, accent.darker]} style={styles.upgradeBtn}>
              <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
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
          <AnimatedPress onPress={requestPermission}>
            <LinearGradient colors={[accent.deep, accent.deep]} style={styles.upgradeBtn}>
              <Text style={styles.upgradeBtnText}>Enable Camera</Text>
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
    setScanning(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
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

      if (!res.ok) {
        const data = await res.json();
        Alert.alert('Scan Failed', data.error || 'Could not analyze the photo.');
        setScanning(false);
        return;
      }

      const data: ScanResult = await res.json();
      setResult(data);
    } catch (e) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const logMeal = () => {
    if (!result) return;

    const today = new Date().toISOString().slice(0, 10);
    addMeal({
      id: `scan-${Date.now()}`,
      date: today,
      mealType: selectedMealType as any,
      foods: result.items.map((item, i) => ({
        foodId: `scan-${Date.now()}-${i}`,
        foodName: item.name,
        servings: 1,
        calories: item.calories,
        proteinGrams: item.protein,
        carbsGrams: item.carbs,
        fatGrams: item.fat,
      })),
      notes: `Scanned: ${result.description}`,
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

            {/* Individual items */}
            <Text style={styles.sectionTitle}>Identified Foods</Text>
            {result.items.map((item, i) => (
              <GlassCard key={i} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemGrams}>~{item.estimatedGrams}g</Text>
                </View>
                <View style={styles.itemMacros}>
                  <Text style={styles.itemMacro}>{item.calories} cal</Text>
                  <Text style={[styles.itemMacro, { color: accent.deep }]}>P {item.protein}g</Text>
                  <Text style={[styles.itemMacro, { color: accent.pastel }]}>C {item.carbs}g</Text>
                  <Text style={[styles.itemMacro, { color: '#ef4444' }]}>F {item.fat}g</Text>
                </View>
              </GlassCard>
            ))}

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
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemName: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.darkText, flex: 1 },
  itemGrams: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary },
  itemMacros: { flexDirection: 'row', gap: Spacing.md },
  itemMacro: { fontSize: FontSizes.xs, fontWeight: '500', color: Colors.darkTextSecondary },

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
