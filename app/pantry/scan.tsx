/**
 * Pantry Scan — snap your fridge / pantry, AI identifies items, you
 * check the ones to add.
 *
 * Flow:
 *   1. Tap "Camera" or "Library" → expo-image-picker returns a local URI.
 *   2. Convert to base64 → POST to `aimee-pantry-scan` edge function.
 *   3. Show every detected item as a checkbox row, pre-checked for
 *      confidence ≥ 0.5. User unchecks misreads.
 *   4. Tap "Add to pantry" → bulk addItem into usePantryStore.
 *
 * Stays on the Plus / Pro side of the paywall — same gating as
 * food-scan (handled server-side; the client just surfaces the upsell
 * if 403 comes back).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { supabase } from '../../src/services/supabase';
import { usePantryStore, type StorageLocation } from '../../src/store/usePantryStore';
import { clamp, clampString } from '../../src/utils/aimeeActionSanitize';

const ALLOWED_PANTRY_UNITS = new Set([
  'each', 'oz', 'g', 'lb', 'kg', 'cup', 'tbsp', 'tsp', 'ml', 'l',
]);
const ALLOWED_STORAGE = new Set<StorageLocation>(['fridge', 'freezer', 'pantry']);

interface DetectedItem {
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  storageLocation?: StorageLocation;
  confidence?: number;
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
}

export default function PantryScanScreen() {
  const router = useRouter();
  const t = useV3Theme();
  const addPantryItem = usePantryStore((s) => s.addItem);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [editExpiry, setEditExpiry] = useState<Record<number, string>>({});

  // Guard against setState-after-unmount when the user navigates away
  // mid-upload. The scan call can take ~30s on a slow connection; a
  // resolved promise reaching `setItems` on a dead component is a soft
  // memory warning rather than a crash, but the right shape avoids it.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const safe = <T extends (...args: any[]) => void>(fn: T): T =>
    ((...args: Parameters<T>) => {
      if (mountedRef.current) fn(...args);
    }) as T;

  const updateItem = (i: number, patch: Partial<DetectedItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const removeRow = (i: number) => {
    tapMedium();
    setItems((prev) => prev.filter((_, idx) => idx !== i));
    setSelected((prev) => prev.filter((_, idx) => idx !== i));
    setExpandedIndex(null);
  };

  const UNITS: DetectedItem['unit'][] = [
    'each', 'oz', 'g', 'lb', 'cup', 'tbsp', 'tsp', 'ml', 'l',
  ];
  const STORAGES: NonNullable<DetectedItem['storageLocation']>[] = [
    'fridge', 'freezer', 'pantry',
  ];

  const pickAndScan = async (source: 'camera' | 'library') => {
    tapMedium();
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          source === 'camera' ? 'Camera permission needed' : 'Photos permission needed',
          'Enable access in Settings to scan your kitchen.',
        );
        return;
      }
      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              quality: 0.6,
              allowsEditing: false,
              base64: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              quality: 0.6,
              allowsEditing: false,
              base64: false,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });
      if (res.canceled || !res.assets?.[0]) return;
      const uri = res.assets[0].uri;
      if (!mountedRef.current) return;
      setPhotoUri(uri);
      setItems([]);
      setSelected([]);
      setScanning(true);

      const FileSystem: any = await import('expo-file-system');
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      const { data, error } = await (supabase as any).functions.invoke(
        'aimee-pantry-scan',
        { body: { imageBase64: base64 } },
      );
      // Guard every post-await setState — the user could have navigated
      // away during the 30s vision round-trip.
      if (!mountedRef.current) return;
      if (error) {
        const status = (error as any)?.status ?? 0;
        if (status === 403) {
          router.push('/subscription' as never);
          safe(setScanning)(false);
          return;
        }
        // Wave 76.47: the supabase-js invoke() error.message is a
        // generic "non-2xx status" by default — the real server error
        // is in the response body, which we have to await off the
        // FunctionsHttpError context. Surface whatever we can find so
        // testers can see "rate limit" / "missing key" / etc. instead
        // of a useless "try a clearer photo".
        let detail = (error as any)?.message ?? '';
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json().catch(() => null);
            if (body?.error) detail = body.error;
          }
        } catch {
          /* swallow — we still have the generic message */
        }
        Alert.alert('Scan failed', detail || 'Try a clearer, well-lit photo.');
        safe(setScanning)(false);
        return;
      }
      const detected: DetectedItem[] = Array.isArray(data?.items)
        ? data.items
        : [];
      if (!mountedRef.current) return;
      // Empty result is a real outcome — vision didn't find anything.
      // Tell the user exactly that instead of leaving them on a blank
      // checklist wondering if the call worked.
      if (detected.length === 0) {
        Alert.alert(
          'Nothing detected',
          data?.message ||
            'The scanner didn\'t recognize any food items in this photo. Try a closer shot with better light, or use the Add Manually flow.',
        );
        setScanning(false);
        return;
      }
      setItems(detected);
      setSelected(detected.map((d) => (d.confidence ?? 1) >= 0.5));
      setScanning(false);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[pantry-scan] failed:', msg);
      Alert.alert('Scan failed', msg || 'Try again with a clearer photo.');
      setScanning(false);
    }
  };

  const toggle = (i: number) => {
    tapLight();
    setSelected((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  const confirm = () => {
    const chosenWithIdx = items
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => selected[i]);
    if (chosenWithIdx.length === 0) {
      Alert.alert('Nothing selected', 'Pick at least one item to add.');
      return;
    }
    for (const { item, i } of chosenWithIdx) {
      const expiryRaw = (editExpiry[i] ?? '').trim();
      const expiryDate = /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? expiryRaw : undefined;
      // Clamp every LLM-emitted field. Even though the inline editor
      // lets the user fix bad values, an unedited bulk-add still
      // accepts whatever the vision model returned. Mirrors the
      // sanitizeAddToPantry caps (name ≤120, qty ≤10000, unit/storage
      // enums) so this surface and the chat surface agree.
      const name = clampString(item.name, 120);
      if (!name) continue;
      const rawQty = Number(item.quantity);
      const quantity = Number.isFinite(rawQty) && rawQty > 0
        ? Math.min(Math.round(rawQty * 100) / 100, 10000)
        : 1;
      const unitRaw = typeof item.unit === 'string' ? item.unit.toLowerCase() : '';
      const unit = ALLOWED_PANTRY_UNITS.has(unitRaw) ? unitRaw : 'each';
      const storageRaw = typeof item.storageLocation === 'string'
        ? item.storageLocation.toLowerCase()
        : '';
      const storageLocation: StorageLocation = ALLOWED_STORAGE.has(storageRaw as StorageLocation)
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
      addPantryItem({
        name,
        quantity,
        unit,
        category: typeof item.category === 'string'
          ? clampString(item.category, 40) || undefined
          : undefined,
        storageLocation,
        expiryDate,
        nutrition: safeNutrition,
      });
    }
    tapMedium();
    // Wave 76.44: surface the pantry → meal-ideas flow. Before this,
    // users added items and bounced back with no idea Aimee could
    // turn the pantry into recipes.
    Alert.alert(
      'Added to pantry',
      `${chosenWithIdx.length} item${chosenWithIdx.length === 1 ? '' : 's'} saved. Want Aimee to suggest meals from what you have?`,
      [
        { text: 'Maybe later', style: 'cancel', onPress: () => router.back() },
        {
          text: 'Get meal ideas',
          onPress: () => router.replace('/nutrition/pantry-suggestions' as never),
        },
      ],
    );
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: t.colors.bgBase1 as string }}
      edges={['top', 'bottom']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={t.colors.textPrimary as string}
          />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            {
              color: t.colors.textPrimary as string,
              fontFamily: t.isDark
                ? t.typography.headlineMale
                : t.typography.headlineFemale,
            },
          ]}
        >
          Scan your kitchen
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 120 }}>
        {!photoUri ? (
          <View style={{ marginTop: 32 }}>
            <Text
              style={[
                styles.lead,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              Point the camera at an open fridge, freezer, or pantry shelf.
              I'll read everything I can see and you pick what's right.
            </Text>
            <Pressable
              onPress={() => pickAndScan('camera')}
              style={[
                styles.bigBtn,
                { backgroundColor: t.colors.textPrimary as string },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open camera"
            >
              <Ionicons
                name="camera"
                size={22}
                color={t.colors.bgBase1 as string}
              />
              <Text
                style={{
                  color: t.colors.bgBase1 as string,
                  fontFamily: t.typography.bodyBold,
                  marginLeft: 8,
                }}
              >
                Take photo
              </Text>
            </Pressable>
            <Pressable
              onPress={() => pickAndScan('library')}
              style={[
                styles.bigBtnSecondary,
                { borderColor: t.colors.textSecondary as string },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Pick from library"
            >
              <Ionicons
                name="image-outline"
                size={22}
                color={t.colors.textPrimary as string}
              />
              <Text
                style={{
                  color: t.colors.textPrimary as string,
                  fontFamily: t.typography.bodyBold,
                  marginLeft: 8,
                }}
              >
                Choose from library
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <Image source={{ uri: photoUri }} style={styles.preview} />
            {scanning ? (
              <View style={styles.scanningRow}>
                <ActivityIndicator color={t.colors.textPrimary as string} />
                <Text
                  style={{
                    marginLeft: 10,
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.body,
                  }}
                >
                  Reading your kitchen…
                </Text>
              </View>
            ) : items.length === 0 ? (
              <Text
                style={{
                  marginTop: 18,
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                }}
              >
                Couldn't spot anything. Try a closer shot with better light.
              </Text>
            ) : (
              <View style={{ marginTop: 12 }}>
                <Text
                  style={{
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 12,
                    letterSpacing: 1.0,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Tap to confirm or remove
                </Text>
                {items.map((it, i) => {
                  const on = selected[i] ?? false;
                  const expanded = expandedIndex === i;
                  return (
                    <View
                      key={`${it.name}-${i}`}
                      style={[
                        styles.row,
                        {
                          borderColor: on
                            ? (t.colors.textPrimary as string)
                            : 'rgba(0,0,0,0.08)',
                          backgroundColor: on
                            ? 'rgba(0,0,0,0.04)'
                            : 'transparent',
                          flexDirection: 'column',
                          alignItems: 'stretch',
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Pressable
                          onPress={() => toggle(i)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={`Toggle ${it.name}`}
                          style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}
                        >
                          <View
                            style={[
                              styles.check,
                              {
                                borderColor: t.colors.textPrimary as string,
                                backgroundColor: on
                                  ? (t.colors.textPrimary as string)
                                  : 'transparent',
                              },
                            ]}
                          >
                            {on ? (
                              <Ionicons
                                name="checkmark"
                                size={14}
                                color={t.colors.bgBase1 as string}
                              />
                            ) : null}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                color: t.colors.textPrimary as string,
                                fontFamily: t.typography.bodyBold,
                              }}
                            >
                              {it.name}
                            </Text>
                            <Text
                              style={{
                                color: t.colors.textSecondary as string,
                                fontFamily: t.typography.body,
                                fontSize: 12,
                                marginTop: 2,
                              }}
                            >
                              {it.quantity ?? 1} {it.unit ?? 'each'}
                              {it.storageLocation
                                ? ` · ${it.storageLocation}`
                                : ''}
                              {it.confidence != null
                                ? ` · ${Math.round((it.confidence ?? 0) * 100)}%`
                                : ''}
                            </Text>
                          </View>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            tapLight();
                            setExpandedIndex(expanded ? null : i);
                          }}
                          hitSlop={8}
                          style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                          accessibilityRole="button"
                          accessibilityLabel={expanded ? 'Close editor' : 'Edit details'}
                        >
                          <Ionicons
                            name={expanded ? 'chevron-up' : 'create-outline'}
                            size={20}
                            color={t.colors.textSecondary as string}
                          />
                        </Pressable>
                      </View>

                      {expanded ? (
                        <View style={styles.editor}>
                          <Text style={[styles.editorLabel, { color: t.colors.textSecondary as string }]}>
                            Name
                          </Text>
                          <TextInput
                            style={[
                              styles.editorInput,
                              {
                                color: t.colors.textPrimary as string,
                                borderColor: 'rgba(0,0,0,0.12)',
                              },
                            ]}
                            value={it.name}
                            onChangeText={(v) => updateItem(i, { name: v })}
                            placeholder="Item name"
                            placeholderTextColor={t.colors.textSecondary as string}
                          />

                          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                            <View style={{ width: 90 }}>
                              <Text
                                style={[styles.editorLabel, { color: t.colors.textSecondary as string }]}
                              >
                                Quantity
                              </Text>
                              <TextInput
                                style={[
                                  styles.editorInput,
                                  {
                                    color: t.colors.textPrimary as string,
                                    borderColor: 'rgba(0,0,0,0.12)',
                                  },
                                ]}
                                value={String(it.quantity ?? 1)}
                                onChangeText={(v) => {
                                  const n = Number(v.replace(/[^\d.]/g, ''));
                                  updateItem(i, {
                                    quantity: Number.isFinite(n) && n > 0 ? n : 1,
                                  });
                                }}
                                keyboardType="decimal-pad"
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[styles.editorLabel, { color: t.colors.textSecondary as string }]}
                              >
                                Unit
                              </Text>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 6 }}
                              >
                                {UNITS.map((u) => {
                                  const active = (it.unit ?? 'each') === u;
                                  return (
                                    <Pressable
                                      key={u}
                                      onPress={() => updateItem(i, { unit: u })}
                                      style={[
                                        styles.chip,
                                        {
                                          backgroundColor: active
                                            ? (t.colors.textPrimary as string)
                                            : 'transparent',
                                          borderColor: t.colors.textPrimary as string,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          color: active
                                            ? (t.colors.bgBase1 as string)
                                            : (t.colors.textPrimary as string),
                                          fontFamily: t.typography.bodyBold,
                                          fontSize: 12,
                                        }}
                                      >
                                        {u}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          </View>

                          <Text
                            style={[
                              styles.editorLabel,
                              { color: t.colors.textSecondary as string, marginTop: 10 },
                            ]}
                          >
                            Storage
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {STORAGES.map((s) => {
                              const active = (it.storageLocation ?? 'pantry') === s;
                              return (
                                <Pressable
                                  key={s}
                                  onPress={() => updateItem(i, { storageLocation: s })}
                                  style={[
                                    styles.chip,
                                    {
                                      backgroundColor: active
                                        ? (t.colors.textPrimary as string)
                                        : 'transparent',
                                      borderColor: t.colors.textPrimary as string,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={{
                                      color: active
                                        ? (t.colors.bgBase1 as string)
                                        : (t.colors.textPrimary as string),
                                      fontFamily: t.typography.bodyBold,
                                      fontSize: 12,
                                    }}
                                  >
                                    {s}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          <Text
                            style={[
                              styles.editorLabel,
                              { color: t.colors.textSecondary as string, marginTop: 10 },
                            ]}
                          >
                            Expiry date (YYYY-MM-DD, optional)
                          </Text>
                          <TextInput
                            style={[
                              styles.editorInput,
                              {
                                color: t.colors.textPrimary as string,
                                borderColor: 'rgba(0,0,0,0.12)',
                              },
                            ]}
                            value={editExpiry[i] ?? ''}
                            onChangeText={(v) =>
                              setEditExpiry((prev) => ({ ...prev, [i]: v }))
                            }
                            placeholder="2026-06-30"
                            placeholderTextColor={t.colors.textSecondary as string}
                            autoCapitalize="none"
                            autoCorrect={false}
                          />

                          <Pressable
                            onPress={() => removeRow(i)}
                            style={[styles.removeBtn]}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${it.name}`}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={16}
                              color={
                                ((t.colors as any).semanticDanger as string) ?? '#B91C1C'
                              }
                            />
                            <Text
                              style={{
                                color:
                                  ((t.colors as any).semanticDanger as string) ?? '#B91C1C',
                                fontFamily: t.typography.bodyBold,
                                marginLeft: 6,
                              }}
                            >
                              Remove this item
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
            <Pressable
              onPress={() => {
                setPhotoUri(null);
                setItems([]);
                setSelected([]);
              }}
              style={[styles.retake]}
              accessibilityRole="button"
              accessibilityLabel="Retake"
            >
              <Ionicons
                name="refresh"
                size={16}
                color={t.colors.textSecondary as string}
              />
              <Text
                style={{
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                  marginLeft: 6,
                }}
              >
                Retake
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {items.length > 0 ? (
        <View
          style={[
            styles.footer,
            { backgroundColor: t.colors.bgBase1 as string },
          ]}
        >
          <Pressable
            onPress={confirm}
            style={[
              styles.confirmBtn,
              { backgroundColor: t.colors.textPrimary as string },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add selected to pantry"
          >
            <Ionicons
              name="checkmark"
              size={18}
              color={t.colors.bgBase1 as string}
            />
            <Text
              style={{
                color: t.colors.bgBase1 as string,
                fontFamily: t.typography.bodyBold,
                marginLeft: 8,
              }}
            >
              Add {selected.filter(Boolean).length} to pantry
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 18,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  bigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 999,
    marginBottom: 10,
  },
  bigBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  editor: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  editorLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  editorInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 8,
  },
  retake: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 999,
  },
});
