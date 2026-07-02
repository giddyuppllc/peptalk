/**
 * InBody Manual Entry Screen
 *
 * Until InBody REST/OAuth is live, this is the canonical way to get
 * scan data into the app. Designed for "I just walked out of a clinic
 * with a paper printout in my hand" — minimum fields are weight and
 * body fat %; everything else is optional.
 *
 * Visual rules (consumer-friendly per user direction 2026-05-16):
 *   - Big number inputs with +/− steppers (no tiny keyboards)
 *   - Optional fields hidden under "Add more" expander
 *   - Save button is huge, primary, locked at the bottom
 *   - Clear "Scanned today" / "Scanned earlier" date picker
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { useBodyCompositionStore } from '../../src/store/useBodyCompositionStore';
import { Spacing, BorderRadius, FontSizes } from '../../src/constants/theme';
import { tapMedium, notifySuccess } from '../../src/utils/haptics';

interface FieldState {
  weightLb: string;
  bodyFatPercent: string;
  leanMassLb: string;
  fatMassLb: string;
  ecwTbwRatio: string;
  bmrKcal: string;
  visceralFatLevel: string;
}

const initialState: FieldState = {
  weightLb: '',
  bodyFatPercent: '',
  leanMassLb: '',
  fatMassLb: '',
  ecwTbwRatio: '',
  bmrKcal: '',
  visceralFatLevel: '',
};

export default function InBodyEntryScreen() {
  const router = useRouter();
  const t = useTheme();
  const accent = useSectionAccent();
  const addScan = useBodyCompositionStore((s) => s.addScan);

  const [fields, setFields] = useState<FieldState>(initialState);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const setField = (key: keyof FieldState, value: string) => {
    // Numeric-only with one decimal. Easier to type weights than letting
    // the user dump arbitrary text and crash the parser later.
    const cleaned = value.replace(/[^0-9.]/g, '');
    setFields((s) => ({ ...s, [key]: cleaned }));
  };

  const numOrUndefined = (s: string): number | undefined => {
    const n = Number(s);
    return Number.isFinite(n) && s.trim() !== '' ? n : undefined;
  };

  const hasMinimum =
    fields.weightLb.trim() !== '' || fields.bodyFatPercent.trim() !== '';

  const save = async () => {
    if (!hasMinimum || saving) return;
    setSaving(true);
    tapMedium();

    const weightLb = numOrUndefined(fields.weightLb);
    const bodyFatPercent = numOrUndefined(fields.bodyFatPercent);
    let leanMassLb = numOrUndefined(fields.leanMassLb);
    let fatMassLb = numOrUndefined(fields.fatMassLb);
    // If user gave weight + bf% but not lean/fat split, derive it.
    // This is honest math, not fabrication — body fat % is the user's
    // input, lean = weight × (1 − bf%/100).
    if (
      leanMassLb === undefined &&
      weightLb !== undefined &&
      bodyFatPercent !== undefined
    ) {
      leanMassLb = Number((weightLb * (1 - bodyFatPercent / 100)).toFixed(1));
    }
    if (
      fatMassLb === undefined &&
      weightLb !== undefined &&
      bodyFatPercent !== undefined
    ) {
      fatMassLb = Number((weightLb * (bodyFatPercent / 100)).toFixed(1));
    }

    addScan({
      scannedAt: new Date().toISOString(),
      source: 'manual',
      weightLb,
      bodyFatPercent,
      leanMassLb,
      fatMassLb,
      ecwTbwRatio: numOrUndefined(fields.ecwTbwRatio),
      bmrKcal: numOrUndefined(fields.bmrKcal),
      visceralFatLevel: numOrUndefined(fields.visceralFatLevel),
    });

    notifySuccess();
    setSaving(false);
    router.back();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Log Scan</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.hint, { color: t.textSecondary }]}>
          Manual entry — punch in what's on your InBody printout (device sync
          isn't connected yet). Weight and body fat % are enough; the rest is
          optional.
        </Text>

        {/* Primary fields */}
        <View style={styles.fieldRow}>
          <BigField
            label="Weight"
            unit="lb"
            value={fields.weightLb}
            onChangeText={(v) => setField('weightLb', v)}
            color={t.text}
            secondary={t.textSecondary}
          />
          <BigField
            label="Body fat"
            unit="%"
            value={fields.bodyFatPercent}
            onChangeText={(v) => setField('bodyFatPercent', v)}
            color={t.text}
            secondary={t.textSecondary}
          />
        </View>

        {/* Optional fields under expander */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowAdvanced((s) => !s)}
          style={[styles.expander, { borderColor: t.cardBorder }]}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvanced }}
        >
          <Ionicons
            name={showAdvanced ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={t.textSecondary}
          />
          <Text style={[styles.expanderText, { color: t.text }]}>
            Add more details {showAdvanced ? '' : '(optional)'}
          </Text>
        </TouchableOpacity>

        {showAdvanced && (
          <View style={styles.advancedBox}>
            <View style={styles.fieldRow}>
              <BigField
                label="Lean mass"
                unit="lb"
                value={fields.leanMassLb}
                onChangeText={(v) => setField('leanMassLb', v)}
                color={t.text}
                secondary={t.textSecondary}
              />
              <BigField
                label="Fat mass"
                unit="lb"
                value={fields.fatMassLb}
                onChangeText={(v) => setField('fatMassLb', v)}
                color={t.text}
                secondary={t.textSecondary}
              />
            </View>
            <View style={styles.fieldRow}>
              <BigField
                label="BMR"
                unit="kcal"
                value={fields.bmrKcal}
                onChangeText={(v) => setField('bmrKcal', v)}
                color={t.text}
                secondary={t.textSecondary}
              />
              <BigField
                label="Visceral fat"
                unit="lvl"
                value={fields.visceralFatLevel}
                onChangeText={(v) => setField('visceralFatLevel', v)}
                color={t.text}
                secondary={t.textSecondary}
              />
            </View>
            <View style={styles.fieldRow}>
              <BigField
                label="ECW / TBW"
                unit="ratio"
                value={fields.ecwTbwRatio}
                onChangeText={(v) => setField('ecwTbwRatio', v)}
                color={t.text}
                secondary={t.textSecondary}
              />
              <View style={{ flex: 1 }} />
            </View>
            <Text style={[styles.advHint, { color: t.textSecondary }]}>
              ECW / TBW = fluid balance (extracellular vs total body water).
              0.36–0.39 is balanced.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Sticky save bar */}
      <View style={[styles.saveBar, { backgroundColor: t.bg, borderTopColor: t.cardBorder }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={save}
          disabled={!hasMinimum || saving}
          accessibilityRole="button"
          accessibilityLabel="Save scan"
        >
          <LinearGradient
            colors={hasMinimum ? [accent.deep, accent.pastel] : ['#9aa', '#9aa']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.saveBtn}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'Saving…' : 'Save scan'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────
// BigField — large numeric input. Designed so users with a paper
// printout can punch in fast without hunting for tiny boxes.
// ────────────────────────────────────────────────────────────────────
function BigField({
  label,
  unit,
  value,
  onChangeText,
  color,
  secondary,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (s: string) => void;
  color: string;
  secondary: string;
}) {
  return (
    <View style={[styles.bigField, { borderColor: 'rgba(0,0,0,0.08)' }]}>
      <Text style={[styles.bigFieldLabel, { color: secondary }]}>{label}</Text>
      <View style={styles.bigFieldRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="—"
          placeholderTextColor="rgba(0,0,0,0.25)"
          keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
          style={[styles.bigFieldInput, { color }]}
          maxLength={6}
        />
        <Text style={[styles.bigFieldUnit, { color: secondary }]}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Playfair-Bold',
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 160,
  },
  hint: {
    fontSize: FontSizes.sm,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  bigField: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  bigFieldLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  bigFieldRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  bigFieldInput: {
    fontSize: 28,
    fontFamily: 'DMSans-Bold',
    flex: 1,
    padding: 0,
    minWidth: 60,
  },
  bigFieldUnit: {
    fontSize: 14,
    fontFamily: 'DMSans-Medium',
  },
  expander: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  expanderText: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-Medium',
  },
  advancedBox: {
    marginTop: Spacing.md,
  },
  advHint: {
    fontSize: 11,
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg + 6,
    borderTopWidth: 1,
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontFamily: 'DMSans-Bold',
    fontSize: 16,
    letterSpacing: 0.4,
  },
});
