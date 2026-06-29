/**
 * Cycle log — per-day entry for flow, symptoms, mood, discharge, BBT.
 *
 * Loads any existing log for today (or a date passed via params).
 * All toggles persist immediately via the store; no explicit "Save".
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useTheme } from '../../src/hooks/useTheme';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useCycleStore } from '../../src/store/useCycleStore';
import {
  FLOW_LABELS,
  BODY_SYMPTOM_LABELS,
  MOOD_LABELS,
  DISCHARGE_LABELS,
  type FlowIntensity,
  type BodySymptom,
  type MoodTag,
  type DischargeType,
} from '../../src/types/cycle';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FLOW_OPTIONS: FlowIntensity[] = ['spotting', 'light', 'medium', 'heavy'];
const DISCHARGE_OPTIONS: DischargeType[] = ['none', 'dry', 'sticky', 'creamy', 'watery', 'egg_white'];

export default function CycleLogScreen() {
  const router = useRouter();
  const t = useTheme();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date ?? todayKey();

  const dayLog = useCycleStore((s) => s.getDayLog(date));
  const toggleSymptom = useCycleStore((s) => s.toggleSymptom);
  const toggleMood = useCycleStore((s) => s.toggleMood);
  const setFlow = useCycleStore((s) => s.setFlow);
  const setDischarge = useCycleStore((s) => s.setDischarge);
  const setBBT = useCycleStore((s) => s.setBBT);
  const setSexualActivity = useCycleStore((s) => s.setSexualActivity);
  const upsertDayLog = useCycleStore((s) => s.upsertDayLog);

  const [notes, setNotes] = useState(dayLog?.notes ?? '');
  const [bbtText, setBbtText] = useState(dayLog?.bbt != null ? String(dayLog.bbt) : '');
  const [bbtWarning, setBbtWarning] = useState(false);

  const activeSymptoms = useMemo(() => new Set(dayLog?.symptoms ?? []), [dayLog?.symptoms]);
  const activeMoods = useMemo(() => new Set(dayLog?.moods ?? []), [dayLog?.moods]);

  const commitNotes = () => {
    if ((notes || '') === (dayLog?.notes || '')) return;
    upsertDayLog(date, { notes: notes.trim() || undefined });
  };

  const commitBBT = () => {
    const raw = bbtText.trim();
    if (raw === '') {
      // Cleared input — drop any stored value, no warning.
      setBbtWarning(false);
      setBBT(date, undefined, 'manual');
      return;
    }
    const v = parseFloat(raw);
    if (isNaN(v)) {
      setBbtWarning(false);
      setBBT(date, undefined, 'manual');
      return;
    }
    if (v > 90 && v < 110) {
      // Valid Fahrenheit reading — persist as-is.
      setBbtWarning(false);
      setBBT(date, v, 'manual');
    } else if (v >= 35 && v <= 38) {
      // Plausible Celsius basal temp — convert C→F so it isn't silently dropped.
      const f = Math.round(((v * 9) / 5 + 32) * 10) / 10;
      setBbtWarning(false);
      setBbtText(String(f));
      setBBT(date, f, 'manual');
    } else {
      // Outside both plausible ranges — flag it and don't persist a garbage value.
      setBbtWarning(true);
    }
  };

  const onChangeBBT = (text: string) => {
    if (bbtWarning) setBbtWarning(false);
    setBbtText(text);
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
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerKicker, { color: t.textSecondary }]}>LOG</Text>
          <Text style={[styles.headerTitle, { color: t.text }]}>{formatDate(date)}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Flow */}
        <Section title="Flow" icon="water-outline" tint={t.primary}>
          <View style={styles.pillRow}>
            {FLOW_OPTIONS.map((f) => {
              const active = dayLog?.flow === f;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFlow(date, active ? undefined : f)}
                  style={[
                    styles.pill,
                    { backgroundColor: active ? t.primary : 'rgba(0,0,0,0.04)' },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${FLOW_LABELS[f]} flow`}
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: active ? '#fff' : t.text },
                    ]}
                  >
                    {FLOW_LABELS[f]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* Symptoms */}
        <Section title="Symptoms" icon="pulse-outline" tint={t.primary}>
          <View style={styles.chipWrap}>
            {(Object.keys(BODY_SYMPTOM_LABELS) as BodySymptom[]).map((s) => {
              const active = activeSymptoms.has(s);
              return (
                <Chip
                  key={s}
                  label={BODY_SYMPTOM_LABELS[s]}
                  active={active}
                  onPress={() => toggleSymptom(date, s)}
                  tint={t.primary}
                  textColor={t.text}
                />
              );
            })}
          </View>
        </Section>

        {/* Mood */}
        <Section title="Mood" icon="happy-outline" tint={t.primary}>
          <View style={styles.chipWrap}>
            {(Object.keys(MOOD_LABELS) as MoodTag[]).map((m) => {
              const active = activeMoods.has(m);
              return (
                <Chip
                  key={m}
                  label={MOOD_LABELS[m]}
                  active={active}
                  onPress={() => toggleMood(date, m)}
                  tint={t.primary}
                  textColor={t.text}
                />
              );
            })}
          </View>
        </Section>

        {/* Discharge */}
        <Section title="Cervical mucus" icon="water-outline" tint={t.primary}>
          <View style={styles.pillRow}>
            {DISCHARGE_OPTIONS.map((d) => {
              const active = dayLog?.discharge === d;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => setDischarge(date, active ? undefined : d)}
                  style={[
                    styles.pill,
                    { backgroundColor: active ? t.primary : 'rgba(0,0,0,0.04)' },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Discharge: ${DISCHARGE_LABELS[d]}`}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.pillText, { color: active ? '#fff' : t.text }]}>
                    {DISCHARGE_LABELS[d]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* BBT */}
        <Section title="Basal body temperature" icon="thermometer-outline" tint={t.primary}>
          <View style={styles.bbtRow}>
            <TextInput
              style={[styles.bbtInput, { backgroundColor: t.inputBg, color: t.text }]}
              value={bbtText}
              onChangeText={onChangeBBT}
              onBlur={commitBBT}
              keyboardType="decimal-pad"
              placeholder="97.8"
              placeholderTextColor={t.placeholder}
              accessibilityLabel="Basal body temperature in Fahrenheit"
            />
            <Text style={[styles.bbtUnit, { color: t.textSecondary }]}>°F</Text>
          </View>
          {bbtWarning && (
            <Text style={[styles.bbtWarning, { color: t.primary }]}>
              Enter a Fahrenheit temperature between 90 and 110°F (e.g. 97.8). Tip: Celsius
              readings around 36.5° are converted automatically.
            </Text>
          )}
          <Text style={[styles.hint, { color: t.textSecondary }]}>
            Measure first thing in the morning, before moving.
          </Text>
        </Section>

        {/* Sexual activity */}
        <Section title="Activity" icon="heart-outline" tint={t.primary}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchLabel, { color: t.text }]}>Sexual activity</Text>
              <Text style={[styles.switchSub, { color: t.textSecondary }]}>
                Private — stays on your device + your encrypted Supabase row.
              </Text>
            </View>
            <Switch
              value={dayLog?.sexualActivity === true}
              onValueChange={(v) => setSexualActivity(date, v)}
              trackColor={{ false: 'rgba(0,0,0,0.12)', true: t.primary }}
              accessibilityLabel="Log sexual activity"
            />
          </View>
        </Section>

        {/* Test results */}
        <Section title="Test results" icon="checkmark-done-outline" tint={t.primary}>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: t.text, flex: 1 }]}>
              Positive ovulation test
            </Text>
            <Switch
              value={dayLog?.positiveOvulationTest === true}
              onValueChange={(v) => {
                upsertDayLog(date, { positiveOvulationTest: v || undefined });
              }}
              trackColor={{ false: 'rgba(0,0,0,0.12)', true: t.primary }}
              accessibilityLabel="Log positive ovulation test"
            />
          </View>
          <View style={[styles.switchRow, { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', paddingTop: 10 }]}>
            <Text style={[styles.switchLabel, { color: t.text, flex: 1 }]}>
              Positive pregnancy test
            </Text>
            <Switch
              value={dayLog?.positivePregnancyTest === true}
              onValueChange={(v) => {
                upsertDayLog(date, { positivePregnancyTest: v || undefined });
              }}
              trackColor={{ false: 'rgba(0,0,0,0.12)', true: t.primary }}
              accessibilityLabel="Log positive pregnancy test"
            />
          </View>
        </Section>

        {/* Notes */}
        <Section title="Notes" icon="create-outline" tint={t.primary}>
          <TextInput
            style={[styles.notesInput, { backgroundColor: t.inputBg, color: t.text }]}
            value={notes}
            onChangeText={setNotes}
            onBlur={commitNotes}
            placeholder="Anything else to remember about today"
            placeholderTextColor={t.placeholder}
            multiline
            numberOfLines={4}
            accessibilityLabel="Free-form notes"
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  icon,
  tint,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={15} color={tint} />
        <Text style={[styles.sectionTitle, { color: t.text }]}>{title}</Text>
      </View>
      <GlassCard>{children}</GlassCard>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  tint,
  textColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tint: string;
  textColor: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? tint : 'rgba(0,0,0,0.04)' },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerKicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 99,
  },
  pillText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bbtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bbtInput: {
    flex: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 14,
    height: 44,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  bbtUnit: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  hint: {
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
  bbtWarning: {
    fontSize: 11,
    marginTop: 6,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginBottom: 2,
  },
  switchSub: {
    fontSize: 11,
  },
  notesInput: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 90,
    fontSize: FontSizes.sm,
    textAlignVertical: 'top',
  },
});
