/**
 * Add to Pantry — three input modes:
 *   1. Manual — typed form
 *   2. Voice / NL — dictate or type a sentence ("2 lbs chicken breast in
 *      the freezer expires next Tuesday") and the aimee-pantry-parse
 *      edge function turns it into structured pantry items.
 *   3. Barcode — scan → lookup via Open Food Facts → prefill manual form.
 *
 * The iOS keyboard mic button handles speech recognition natively, so
 * "voice input" is a text field the user can dictate into.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { GradientButton } from '../../src/components/GradientButton';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { usePantryStore, type StorageLocation } from '../../src/store/usePantryStore';
import { useFeatureGate } from '../../src/hooks/useFeatureGate';
import { supabase } from '../../src/services/supabase';
import { clamp, clampString } from '../../src/utils/aimeeActionSanitize';
import { ensureAiConsent } from '../../src/utils/ensureAiConsent';

const NL_ALLOWED_PANTRY_UNITS = new Set([
  'each', 'oz', 'g', 'lb', 'kg', 'cup', 'tbsp', 'tsp', 'ml', 'l',
]);
const NL_ALLOWED_STORAGE = new Set<StorageLocation>(['fridge', 'freezer', 'pantry']);

type Mode = 'manual' | 'voice' | 'barcode';

const CATEGORY_OPTIONS = ['produce', 'dairy', 'grain', 'protein', 'condiment', 'frozen', 'snack', 'beverage', 'other'];

export default function AddPantryScreen() {
  const router = useRouter();
  const t = useTheme();
  const addItem = usePantryStore((s) => s.addItem);
  const hasVoice = useFeatureGate('voice_log');

  const [mode, setMode] = useState<Mode>('manual');

  // Manual state
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('each');
  const [category, setCategory] = useState<string>('');
  const [storageLocation, setStorageLocation] = useState<StorageLocation>('pantry');
  const [expiryDate, setExpiryDate] = useState('');

  // Voice/NL state
  const [nlText, setNlText] = useState('');
  const [nlLoading, setNlLoading] = useState(false);

  // aimee-pantry-parse can take 5-15s. Guard post-await setState so the
  // screen can be backed out mid-call without leaking state.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const resetManual = () => {
    setName('');
    setBrand('');
    setQuantity('1');
    setUnit('each');
    setCategory('');
    setStorageLocation('pantry');
    setExpiryDate('');
  };

  const handleManualSave = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      Alert.alert('Name required', 'Give the item a name.');
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Quantity required', 'Enter a valid quantity.');
      return;
    }
    addItem({
      name: cleanName,
      brand: brand.trim() || undefined,
      quantity: qty,
      unit: unit.trim() || 'each',
      category: category.trim() || undefined,
      storageLocation,
      expiryDate: expiryDate.trim() || undefined,
    });
    resetManual();
    router.back();
  };

  const handleNlParse = async () => {
    const text = nlText.trim();
    if (!text) {
      Alert.alert('Describe your items', 'Type or dictate what you want to add.');
      return;
    }
    // App Review 5.1.2: explicit consent before sending pantry text to xAI (Aimee).
    if (!(await ensureAiConsent())) return;
    setNlLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('aimee-pantry-parse', {
        body: { text },
      });
      if (!mountedRef.current) return;
      if (error) throw error;
      const items = (data?.items ?? []) as {
        name?: string;
        brand?: string | null;
        quantity?: number;
        unit?: string;
        category?: string | null;
        storageLocation?: StorageLocation;
        expiryDate?: string | null;
        notes?: string | null;
        nutrition?: {
          perServing: {
            calories: number;
            proteinGrams: number;
            carbsGrams: number;
            fatGrams: number;
            fiberGrams?: number;
          };
          servingLabel?: string;
        };
      }[];
      if (items.length === 0) {
        Alert.alert('Nothing parsed', 'Try rephrasing — include quantity, name, and where it\'s stored.');
        setNlLoading(false);
        return;
      }
      let added = 0;
      // Cap LLM-emitted items array at 50 (same as the chat add_to_pantry
      // path). Clamp each field — natural-language parsing is just as
      // hallucination-prone as the chat tool, so this surface gets the
      // same defense.
      for (const item of items.slice(0, 50)) {
        const name = clampString(item.name, 120);
        if (!name) continue;
        const rawQty = Number(item.quantity);
        const quantity = Number.isFinite(rawQty) && rawQty > 0
          ? Math.min(Math.round(rawQty * 100) / 100, 10000)
          : 1;
        const unitRaw = typeof item.unit === 'string' ? item.unit.toLowerCase() : '';
        const unit = NL_ALLOWED_PANTRY_UNITS.has(unitRaw) ? unitRaw : 'each';
        const storageRaw = typeof item.storageLocation === 'string'
          ? item.storageLocation.toLowerCase()
          : '';
        const storageLocation: StorageLocation = NL_ALLOWED_STORAGE.has(storageRaw as StorageLocation)
          ? (storageRaw as StorageLocation)
          : 'pantry';
        const safeNutrition = item.nutrition?.perServing
          ? {
              perServing: {
                calories: clamp(item.nutrition.perServing.calories, 3000),
                proteinGrams: clamp(item.nutrition.perServing.proteinGrams, 300),
                carbsGrams: clamp(item.nutrition.perServing.carbsGrams, 500),
                fatGrams: clamp(item.nutrition.perServing.fatGrams, 300),
                fiberGrams: clamp(item.nutrition.perServing.fiberGrams, 100),
              },
              servingLabel: item.nutrition.servingLabel
                ? clampString(item.nutrition.servingLabel, 40)
                : undefined,
            }
          : undefined;
        const expiryRaw = typeof item.expiryDate === 'string' ? item.expiryDate : '';
        const expiryDate = /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? expiryRaw : undefined;
        addItem({
          name,
          brand: typeof item.brand === 'string'
            ? clampString(item.brand, 80) || undefined
            : undefined,
          quantity,
          unit,
          category: typeof item.category === 'string'
            ? clampString(item.category, 40) || undefined
            : undefined,
          storageLocation,
          expiryDate,
          notes: typeof item.notes === 'string'
            ? clampString(item.notes, 200) || undefined
            : undefined,
          nutrition: safeNutrition,
        });
        added++;
      }
      Alert.alert('Added', `${added} item${added !== 1 ? 's' : ''} saved to your pantry.`, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg = err?.message ?? 'Could not parse. Try manual entry.';
      if (msg.includes('Pro tier') || msg.includes('Plus or Pro')) {
        Alert.alert(
          'Upgrade required',
          'Voice pantry entry is a Plus feature. Upgrade to use it — or enter items manually for now.',
        );
      } else {
        Alert.alert('Parse failed', msg);
      }
    } finally {
      if (mountedRef.current) setNlLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Add to Pantry</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.modeRow}>
        {(['manual', 'voice', 'barcode'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMode(m)}
            style={[styles.modeChip, mode === m && { backgroundColor: t.primary }]}
          >
            <Ionicons
              name={
                m === 'manual'
                  ? 'create-outline'
                  : m === 'voice'
                  ? 'mic-outline'
                  : 'barcode-outline'
              }
              size={16}
              color={mode === m ? '#fff' : t.textSecondary}
            />
            <Text
              style={[
                styles.modeChipText,
                { color: mode === m ? '#fff' : t.textSecondary },
              ]}
            >
              {m === 'manual' ? 'Manual' : m === 'voice' ? 'Voice / AI' : 'Barcode'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {mode === 'manual' && (
            <View style={styles.section}>
              <GlassCard>
                <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. chicken breast"
                  placeholderTextColor={t.placeholder}
                />

                <Text style={[styles.fieldLabel, { color: t.textSecondary, marginTop: 12 }]}>
                  Brand (optional)
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                  value={brand}
                  onChangeText={setBrand}
                  placeholder="e.g. Perdue"
                  placeholderTextColor={t.placeholder}
                />

                <View style={styles.qtyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Quantity</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                      value={quantity}
                      onChangeText={setQuantity}
                      keyboardType="decimal-pad"
                      placeholder="1"
                      placeholderTextColor={t.placeholder}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>Unit</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                      value={unit}
                      onChangeText={setUnit}
                      placeholder="lb, oz, each, cup…"
                      placeholderTextColor={t.placeholder}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <Text style={[styles.fieldLabel, { color: t.textSecondary, marginTop: 12 }]}>
                  Storage location
                </Text>
                <View style={styles.storageRow}>
                  {(['fridge', 'freezer', 'pantry'] as const).map((loc) => (
                    <TouchableOpacity
                      key={loc}
                      onPress={() => setStorageLocation(loc)}
                      style={[
                        styles.storageChip,
                        storageLocation === loc && { backgroundColor: t.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.storageChipText,
                          { color: storageLocation === loc ? '#fff' : t.textSecondary },
                        ]}
                      >
                        {loc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { color: t.textSecondary, marginTop: 12 }]}>
                  Category (optional)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {CATEGORY_OPTIONS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCategory(category === c ? '' : c)}
                      style={[
                        styles.catChip,
                        category === c && { backgroundColor: t.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.catChipText,
                          { color: category === c ? '#fff' : t.textSecondary },
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={[styles.fieldLabel, { color: t.textSecondary }]}>
                  Expiry date (optional)
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: t.inputBg, color: t.text }]}
                  value={expiryDate}
                  onChangeText={setExpiryDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={t.placeholder}
                  autoCapitalize="none"
                />
              </GlassCard>

              <View style={styles.ctaWrap}>
                <GradientButton label="Add to pantry" onPress={handleManualSave} />
              </View>
            </View>
          )}

          {mode === 'voice' && (
            <View style={styles.section}>
              <GlassCard>
                <Text style={[styles.helpLead, { color: t.text }]}>
                  Dictate or type what you want to add.
                </Text>
                <Text style={[styles.helpBody, { color: t.textSecondary }]}>
                  On iOS, tap the mic button on the keyboard to dictate. Describe multiple items
                  in one sentence — I'll parse each one into your pantry.
                </Text>

                <View style={styles.examplesBox}>
                  <Text style={[styles.exampleLabel, { color: t.textSecondary }]}>Examples:</Text>
                  <Text style={[styles.example, { color: t.text }]}>
                    "2 lbs chicken breast in the freezer expires next Tuesday"
                  </Text>
                  <Text style={[styles.example, { color: t.text }]}>
                    "A carton of eggs and a gallon of milk in the fridge"
                  </Text>
                  <Text style={[styles.example, { color: t.text }]}>
                    "3 cans of black beans and a bag of jasmine rice in the pantry"
                  </Text>
                </View>

                <TextInput
                  style={[styles.input, styles.nlInput, { backgroundColor: t.inputBg, color: t.text }]}
                  value={nlText}
                  onChangeText={setNlText}
                  placeholder="Describe your items…"
                  placeholderTextColor={t.placeholder}
                  multiline
                  numberOfLines={4}
                />
              </GlassCard>

              <View style={styles.ctaWrap}>
                {nlLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={t.primary} />
                    <Text style={[styles.loadingText, { color: t.textSecondary }]}>
                      Parsing your pantry…
                    </Text>
                  </View>
                ) : (
                  <GradientButton
                    label={hasVoice ? 'Parse and add' : 'Parse and add (Plus)'}
                    onPress={handleNlParse}
                  />
                )}
              </View>
            </View>
          )}

          {mode === 'barcode' && (
            <View style={styles.section}>
              <GlassCard>
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Ionicons name="barcode-outline" size={48} color={t.textSecondary} />
                  <Text style={[styles.helpLead, { color: t.text, marginTop: 12 }]}>
                    Barcode scanner
                  </Text>
                  <Text style={[styles.helpBody, { color: t.textSecondary, textAlign: 'center' }]}>
                    Coming in the next update. For now, use Manual or Voice to add items.
                  </Text>
                </View>
              </GlassCard>
              <View style={styles.ctaWrap}>
                <TouchableOpacity
                  style={[styles.switchBtn, { borderColor: t.primary }]}
                  onPress={() => setMode('manual')}
                >
                  <Text style={[styles.switchBtnText, { color: t.primary }]}>Switch to manual</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  modeChipText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 12,
    minHeight: 42,
    fontSize: FontSizes.md,
    fontWeight: '500',
  },
  nlInput: {
    minHeight: 90,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  qtyRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  storageRow: {
    flexDirection: 'row',
    gap: 8,
  },
  storageChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  storageChipText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    marginRight: 6,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  catChipText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ctaWrap: {
    marginTop: Spacing.md,
  },
  helpLead: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    marginBottom: 6,
  },
  helpBody: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginBottom: 12,
  },
  examplesBox: {
    padding: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(127,179,194,0.08)',
    marginBottom: 12,
  },
  exampleLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  example: {
    fontSize: FontSizes.sm,
    lineHeight: 18,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  loadingText: {
    fontSize: FontSizes.sm,
  },
  switchBtn: {
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  switchBtnText: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
});
