/**
 * Lab entry — Master Refactor Plan v3.1 §10.1.
 *
 * Manual entry surface. Each marker chip opens an inline numeric input;
 * submit writes to useLabResultsStore. The vendor parser path (LabCorp,
 * Quest, photo OCR) pre-fills the same fields so this screen is the
 * single confirm step before save.
 */

import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard, Chip } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import {
  useLabResultsStore,
  LAB_MARKERS,
  LAB_CATEGORY_LABELS,
  type LabCategory,
} from '../../src/store/useLabResultsStore';
import { useAimeeReportsStore } from '../../src/store/useAimeeReportsStore';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CATEGORIES: LabCategory[] = [
  'lipid',
  'metabolic',
  'hormone',
  'inflammation',
  'liver',
  'kidney',
  'cbc',
  'vitamin',
];

export default function LabEntryScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const addResult = useLabResultsStore((s) => s.addResult);
  const refreshInsights = useAimeeReportsStore((s) => s.refreshInsights);

  const [category, setCategory] = useState<LabCategory>('lipid');
  const [drawDate, setDrawDate] = useState(todayKey());
  const [values, setValues] = useState<Record<string, string>>({});

  const markers = LAB_MARKERS.filter((m) => m.category === category);

  const handleSave = () => {
    const entries = Object.entries(values).filter(([, v]) => v.trim() !== '');
    if (entries.length === 0) {
      Alert.alert('Nothing to save', 'Enter at least one value before saving.');
      return;
    }
    tapMedium();
    let savedCount = 0;
    for (const [markerId, raw] of entries) {
      const value = parseFloat(raw);
      if (!Number.isFinite(value)) continue;
      const marker = LAB_MARKERS.find((m) => m.id === markerId);
      if (!marker) continue;
      addResult({
        markerId,
        value,
        unit: marker.unit,
        date: drawDate,
      });
      savedCount++;
    }
    // §10.4 — Aimee narrative on new upload. Refreshing insights picks
    // up the new data point in the next correlation pass.
    refreshInsights();
    Alert.alert(
      'Saved',
      `${savedCount} result${savedCount === 1 ? '' : 's'} added.`,
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  return (
    <V3DetailShell
      title="Add results"
      observation="Enter values for as many markers as you have. Leave others blank."
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Draw date */}
        <GlassCard style={styles.cardSpacing}>
          <Text
            style={[
              styles.label,
              {
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
              },
            ]}
          >
            Draw date
          </Text>
          <View
            style={[
              styles.inputBox,
              {
                borderColor: t.colors.cardBorder as string,
                backgroundColor: t.isDark
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(255,255,255,0.5)',
              },
            ]}
          >
            <TextInput
              value={drawDate}
              onChangeText={setDrawDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={t.colors.textSecondary as string}
              style={{
                flex: 1,
                color: t.colors.textPrimary as string,
                fontFamily: t.typography.bodyBold,
                fontSize: 14,
              }}
            />
          </View>
        </GlassCard>

        {/* Category picker */}
        <View style={styles.catRow}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={LAB_CATEGORY_LABELS[c]}
              primary={category === c}
              onPress={() => {
                tapLight();
                setCategory(c);
              }}
            />
          ))}
        </View>

        {/* Markers */}
        {markers.map((m) => (
          <GlassCard key={m.id} style={styles.markerCard}>
            <View style={styles.markerRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.markerLabel,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.bodyBold,
                    },
                  ]}
                >
                  {m.label}
                </Text>
                <Text
                  style={[
                    styles.markerRef,
                    {
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                    },
                  ]}
                >
                  Ref {m.refLow ?? '—'}-{m.refHigh ?? '—'} {m.unit}
                </Text>
              </View>
              <View
                style={[
                  styles.smallInput,
                  {
                    borderColor: t.colors.cardBorder as string,
                    backgroundColor: t.isDark
                      ? 'rgba(255,255,255,0.04)'
                      : 'rgba(255,255,255,0.5)',
                  },
                ]}
              >
                <TextInput
                  value={values[m.id] ?? ''}
                  onChangeText={(v) =>
                    setValues((prev) => ({ ...prev, [m.id]: v }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={t.colors.textSecondary as string}
                  style={{
                    color: t.colors.textPrimary as string,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 16,
                    minWidth: 60,
                    textAlign: 'right',
                  }}
                />
              </View>
            </View>
          </GlassCard>
        ))}

        <Pressable
          onPress={handleSave}
          style={[
            styles.saveCta,
            { backgroundColor: t.colors.textPrimary as string },
          ]}
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
              fontSize: 13,
              letterSpacing: 0.3,
              marginLeft: 6,
            }}
          >
            Save
          </Text>
        </Pressable>
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  label: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputBox: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  catRow: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  markerCard: {
    marginTop: 8,
    paddingVertical: 12,
  },
  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markerLabel: {
    fontSize: 14,
  },
  markerRef: {
    fontSize: 11,
    marginTop: 2,
  },
  smallInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
    minWidth: 90,
  },
  saveCta: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 999,
  },
});
