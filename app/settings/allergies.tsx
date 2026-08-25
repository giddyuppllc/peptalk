/**
 * Allergies & Intolerances — the entry point `useAllergyStore` never had.
 *
 * The store has existed with `addAllergen` / `updateAllergen` /
 * `removeAllergen` / `getCriticalAllergens` / `hasAnaphylaxis` and ZERO
 * callers. Its own header claims it is used by "expanded intake (onboarding +
 * settings)" — no such screen was ever built. Meanwhile the recipe generator
 * and pantry suggestions read `allergens` to filter AI food suggestions, and
 * Aimee's prompt is meant to receive severe allergens and anaphylaxis history.
 * All of that has been reading an empty array.
 *
 * The seven free-text chips on the health-profile wizard DO work and feed the
 * same filter, so this is not "no protection" — it is the structured half
 * (severity, anaphylaxis, drug and environmental categories) that could never
 * be filled. That half is the safety-relevant one: a label alone cannot tell
 * Aimee the difference between "makes me bloated" and "sends me to hospital".
 *
 * Reached from Profile → Settings → "Allergies & intolerances".
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useAllergyStore } from '../../src/store/useAllergyStore';
import {
  ALLERGY_SEVERITY_LABELS,
  type AllergenEntry,
  type AllergySeverity,
} from '../../src/types/cycle';

const CATEGORIES: { key: AllergenEntry['category']; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'food', label: 'Food', icon: 'restaurant-outline' },
  { key: 'drug', label: 'Medication', icon: 'medkit-outline' },
  { key: 'environmental', label: 'Environmental', icon: 'leaf-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

const SEVERITIES: AllergySeverity[] = ['mild', 'moderate', 'severe', 'anaphylaxis'];

/** Severity drives colour deliberately — anaphylaxis must not look like "mild". */
const SEVERITY_COLOR: Record<AllergySeverity, string> = {
  mild: '#6FA891',
  moderate: '#E8B84B',
  severe: '#E08A5A',
  anaphylaxis: '#D9534F',
};

const DIAGNOSED: { key: NonNullable<AllergenEntry['diagnosedBy']>; label: string }[] = [
  { key: 'self', label: 'Self-identified' },
  { key: 'provider', label: 'Provider' },
  { key: 'allergist', label: 'Allergist' },
];

export default function AllergiesSettingsScreen() {
  const router = useRouter();
  const t = useTheme();

  const allergens = useAllergyStore((s) => s.allergens);
  const addAllergen = useAllergyStore((s) => s.addAllergen);
  const updateAllergen = useAllergyStore((s) => s.updateAllergen);
  const removeAllergen = useAllergyStore((s) => s.removeAllergen);

  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<AllergenEntry['category']>('food');
  const [severity, setSeverity] = useState<AllergySeverity>('moderate');
  const [reactionHistory, setReactionHistory] = useState('');
  const [diagnosedBy, setDiagnosedBy] = useState<AllergenEntry['diagnosedBy']>('self');

  const canSave = label.trim().length > 0;

  const grouped = useMemo(() => {
    const out = new Map<AllergenEntry['category'], AllergenEntry[]>();
    for (const c of CATEGORIES) out.set(c.key, []);
    for (const a of allergens) out.get(a.category)?.push(a);
    return out;
  }, [allergens]);

  const anaphylaxisCount = allergens.filter((a) => a.severity === 'anaphylaxis').length;

  const save = () => {
    if (!canSave) return;
    addAllergen({
      label: label.trim(),
      category,
      severity,
      ...(reactionHistory.trim() ? { reactionHistory: reactionHistory.trim() } : {}),
      diagnosedBy,
    });
    setLabel('');
    setReactionHistory('');
    setSeverity('moderate');
  };

  const confirmRemove = (a: AllergenEntry) => {
    Alert.alert(
      'Remove allergy?',
      `"${a.label}" will no longer be filtered out of meal and recipe suggestions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeAllergen(a.id) },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>Allergies</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, { color: t.textMuted }]}>
          Anything listed here is filtered out of recipe and meal suggestions, and
          shared with Aimee so she can avoid it. Severity matters — it tells her the
          difference between something you would rather skip and something dangerous.
        </Text>

        {anaphylaxisCount > 0 && (
          <View style={[styles.anaphylaxisBanner, { borderColor: SEVERITY_COLOR.anaphylaxis }]}>
            <Ionicons name="warning" size={18} color={SEVERITY_COLOR.anaphylaxis} />
            <Text style={[styles.anaphylaxisText, { color: t.text }]}>
              {anaphylaxisCount} anaphylaxis {anaphylaxisCount === 1 ? 'allergy' : 'allergies'} on
              file. This app does not replace an epinephrine auto-injector or emergency care.
            </Text>
          </View>
        )}

        {/* ── existing entries ── */}
        {CATEGORIES.map((cat) => {
          const rows = grouped.get(cat.key) ?? [];
          if (rows.length === 0) return null;
          return (
            <View key={cat.key} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: t.textMuted }]}>{cat.label}</Text>
              {rows.map((a) => (
                <GlassCard key={a.id} style={styles.row}>
                  <View style={styles.rowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: t.text }]}>{a.label}</Text>
                      {!!a.reactionHistory && (
                        <Text style={[styles.rowNote, { color: t.textMuted }]}>{a.reactionHistory}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmRemove(a)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${a.label}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={t.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* severity is editable in place — it is the field most likely
                      to change after a real reaction */}
                  <View style={styles.sevRow}>
                    {SEVERITIES.map((s) => {
                      const active = a.severity === s;
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => updateAllergen(a.id, { severity: s })}
                          style={[
                            styles.sevChip,
                            { borderColor: active ? SEVERITY_COLOR[s] : t.cardBorder },
                            active && { backgroundColor: SEVERITY_COLOR[s] + '22' },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`${a.label} severity ${ALLERGY_SEVERITY_LABELS[s]}`}
                        >
                          <Text
                            style={[
                              styles.sevChipText,
                              { color: active ? SEVERITY_COLOR[s] : t.textMuted },
                            ]}
                          >
                            {ALLERGY_SEVERITY_LABELS[s]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </GlassCard>
              ))}
            </View>
          );
        })}

        {allergens.length === 0 && (
          <GlassCard style={styles.empty}>
            <Ionicons name="shield-checkmark-outline" size={26} color={t.textMuted} />
            <Text style={[styles.emptyText, { color: t.textMuted }]}>
              Nothing recorded yet. Add anything you react to — food, medication or
              environmental.
            </Text>
          </GlassCard>
        )}

        {/* ── add new ── */}
        <Text style={[styles.sectionTitle, { color: t.textMuted, marginTop: Spacing.lg }]}>
          Add an allergy
        </Text>
        <GlassCard style={styles.addCard}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Peanuts, Penicillin, Pollen"
            placeholderTextColor={t.textMuted}
            style={[styles.input, { color: t.text, borderColor: t.cardBorder }]}
            accessibilityLabel="What are you allergic to"
            returnKeyType="done"
            onSubmitEditing={save}
          />

          <Text style={[styles.fieldLabel, { color: t.textMuted }]}>Type</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={[
                    styles.chip,
                    { borderColor: active ? t.primary : t.cardBorder },
                    active && { backgroundColor: t.primary + '22' },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={c.icon}
                    size={14}
                    color={active ? t.primary : t.textMuted}
                  />
                  <Text style={[styles.chipText, { color: active ? t.primary : t.textMuted }]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: t.textMuted }]}>Severity</Text>
          <View style={styles.chipRow}>
            {SEVERITIES.map((s) => {
              const active = severity === s;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSeverity(s)}
                  style={[
                    styles.chip,
                    { borderColor: active ? SEVERITY_COLOR[s] : t.cardBorder },
                    active && { backgroundColor: SEVERITY_COLOR[s] + '22' },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, { color: active ? SEVERITY_COLOR[s] : t.textMuted }]}>
                    {ALLERGY_SEVERITY_LABELS[s]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: t.textMuted }]}>Identified by</Text>
          <View style={styles.chipRow}>
            {DIAGNOSED.map((d) => {
              const active = diagnosedBy === d.key;
              return (
                <TouchableOpacity
                  key={d.key}
                  onPress={() => setDiagnosedBy(d.key)}
                  style={[
                    styles.chip,
                    { borderColor: active ? t.primary : t.cardBorder },
                    active && { backgroundColor: t.primary + '22' },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, { color: active ? t.primary : t.textMuted }]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            value={reactionHistory}
            onChangeText={setReactionHistory}
            placeholder="What happens when you're exposed? (optional)"
            placeholderTextColor={t.textMuted}
            style={[styles.input, styles.inputMultiline, { color: t.text, borderColor: t.cardBorder }]}
            multiline
            accessibilityLabel="Reaction history"
          />

          <TouchableOpacity
            onPress={save}
            disabled={!canSave}
            style={[
              styles.saveBtn,
              { backgroundColor: canSave ? t.primary : t.cardBorder },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save allergy"
            accessibilityState={{ disabled: !canSave }}
          >
            <Text style={[styles.saveText, { color: canSave ? Colors.darkBg : t.textMuted }]}>
              Add allergy
            </Text>
          </TouchableOpacity>
        </GlassCard>

        <Text style={[styles.footnote, { color: t.textMuted }]}>
          Stored on your account and synced to your other devices. Removing an entry
          stops it being filtered immediately.
        </Text>
      </ScrollView>
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
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '600' },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xl * 2 },
  intro: { fontSize: FontSizes.sm, lineHeight: 20, marginBottom: Spacing.md },
  anaphylaxisBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  anaphylaxisText: { flex: 1, fontSize: FontSizes.xs, lineHeight: 17 },
  section: { marginBottom: Spacing.md },
  sectionTitle: {
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.xs,
  },
  row: { padding: Spacing.sm, marginBottom: Spacing.xs },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  rowLabel: { fontSize: FontSizes.md, fontWeight: '600' },
  rowNote: { fontSize: FontSizes.xs, marginTop: 2 },
  sevRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  sevChip: { borderWidth: 1, borderRadius: BorderRadius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  sevChipText: { fontSize: FontSizes.xs, fontWeight: '600' },
  empty: { padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  emptyText: { fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 19 },
  addCard: { padding: Spacing.md, gap: Spacing.sm },
  fieldLabel: { fontSize: FontSizes.xs, marginTop: Spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { fontSize: FontSizes.xs, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.sm,
  },
  inputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  saveBtn: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  saveText: { fontSize: FontSizes.sm, fontWeight: '700' },
  footnote: { fontSize: FontSizes.xs, lineHeight: 17, marginTop: Spacing.md },
});
