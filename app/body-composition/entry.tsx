/**
 * Body Composition entry — Master Refactor Plan v3.1 §10.1 / §10.3.
 *
 * Manual entry surface for an InBody scan or smart-scale reading. Fields
 * map directly to the BodyCompositionScan schema. Vendor PDF / OCR
 * paths pre-fill the same form before the user hits save.
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
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapMedium } from '../../src/utils/haptics';
import { useBodyCompositionStore } from '../../src/store/useBodyCompositionStore';
import { useAimeeReportsStore } from '../../src/store/useAimeeReportsStore';

interface FieldDef {
  key:
    | 'weightLb'
    | 'bodyFatPercent'
    | 'leanMassLb'
    | 'fatMassLb'
    | 'ecwTbwRatio'
    | 'bmrKcal'
    | 'visceralFatLevel';
  label: string;
  unit: string;
  hint?: string;
}

const FIELDS: FieldDef[] = [
  { key: 'weightLb', label: 'Weight', unit: 'lb' },
  { key: 'bodyFatPercent', label: 'Body fat', unit: '%' },
  { key: 'leanMassLb', label: 'Lean mass', unit: 'lb' },
  { key: 'fatMassLb', label: 'Fat mass', unit: 'lb' },
  {
    key: 'ecwTbwRatio',
    label: 'ECW / TBW',
    unit: '',
    hint: '0.36–0.39 balanced',
  },
  { key: 'bmrKcal', label: 'BMR', unit: 'kcal' },
  {
    key: 'visceralFatLevel',
    label: 'Visceral fat',
    unit: '',
    hint: 'InBody 1–20 scale',
  },
];

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BodyCompositionEntryScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const addScan = useBodyCompositionStore((s) => s.addScan);
  const refreshInsights = useAimeeReportsStore((s) => s.refreshInsights);

  const [scanDate, setScanDate] = useState(todayKey());
  const [values, setValues] = useState<Record<string, string>>({});

  const handleSave = () => {
    const payload: Record<string, number> = {};
    for (const f of FIELDS) {
      const raw = values[f.key];
      if (!raw || raw.trim() === '') continue;
      const v = parseFloat(raw);
      if (Number.isFinite(v)) payload[f.key] = v;
    }
    if (Object.keys(payload).length === 0) {
      Alert.alert('Nothing to save', 'Enter at least one measurement.');
      return;
    }
    tapMedium();
    addScan({
      ...payload,
      scannedAt: new Date(`${scanDate}T12:00:00`).toISOString(),
      source: 'manual',
    });
    // §10.4 — Aimee narrative on new upload.
    refreshInsights();
    // §16 — fire the ingest push so the user gets a tap-to-read banner.
    import('../../src/services/notificationService')
      .then((m) => m.fireIngestNarrativeNudge('inbody'))
      .catch(() => {});
    Alert.alert('Scan saved', 'Your trend lines updated.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <V3DetailShell
      title="Add scan"
      observation="Fill what you have. Anything left blank stays out of the trend."
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
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
            Scan date
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
              value={scanDate}
              onChangeText={setScanDate}
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

        {FIELDS.map((f) => (
          <GlassCard key={f.key} style={styles.fieldCard}>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.fieldLabel,
                    {
                      color: t.colors.textPrimary as string,
                      fontFamily: t.typography.bodyBold,
                    },
                  ]}
                >
                  {f.label}
                </Text>
                {f.hint ? (
                  <Text
                    style={[
                      styles.fieldHint,
                      {
                        color: t.colors.textSecondary as string,
                        fontFamily: t.typography.body,
                      },
                    ]}
                  >
                    {f.hint}
                  </Text>
                ) : null}
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
                  value={values[f.key] ?? ''}
                  onChangeText={(v) =>
                    setValues((prev) => ({ ...prev, [f.key]: v }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={t.colors.textSecondary as string}
                  style={{
                    color: t.colors.textPrimary as string,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 16,
                    minWidth: 70,
                    textAlign: 'right',
                  }}
                />
                {f.unit ? (
                  <Text
                    style={{
                      marginLeft: 4,
                      color: t.colors.textSecondary as string,
                      fontFamily: t.typography.body,
                      fontSize: 11,
                    }}
                  >
                    {f.unit}
                  </Text>
                ) : null}
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
  fieldCard: {
    marginTop: 8,
    paddingVertical: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldLabel: {
    fontSize: 14,
  },
  fieldHint: {
    fontSize: 11,
    marginTop: 2,
  },
  smallInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
    minWidth: 100,
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
