/**
 * Macro Targets settings screen.
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
import { GradientButton } from '../../src/components/GradientButton';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../src/constants/theme';
import { useMealStore } from '../../src/store/useMealStore';
import { useProgressGoalsStore } from '../../src/store/useProgressGoalsStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import {
  computeMacroRecommendation,
  type GoalType,
  type ActivityLevel,
} from '../../src/services/macroCalculator';

export default function MacroTargetsScreen() {
  const router = useRouter();
  const { targets, setTargets } = useMealStore();
  const setGoalValue = useProgressGoalsStore((s) => s.setGoalValue);
  const profile = useHealthProfileStore((s) => s.profile);
  // Select protocols array and filter via useMemo. Inline filter selector
  // returned a fresh array every render, infinite re-rendering this screen.
  const protocols = useDoseLogStore((s) => s.protocols);
  const activeProtocols = useMemo(
    () => protocols.filter((p) => p.isActive),
    [protocols],
  );
  const [cal, setCal] = useState(String(targets.calories));
  const [protein, setProtein] = useState(String(targets.proteinGrams));
  const [carbs, setCarbs] = useState(String(targets.carbsGrams));
  const [fat, setFat] = useState(String(targets.fatGrams));
  const [fiber, setFiber] = useState(String(targets.fiberGrams ?? 30));
  const [water, setWater] = useState(String(targets.waterOz ?? 100));
  const [autoGoal, setAutoGoal] = useState<GoalType>('maintenance');
  const [autoActivity, setAutoActivity] = useState<ActivityLevel>('moderate');
  const [autoRationale, setAutoRationale] = useState<string[] | null>(null);

  // Auto-compute eligibility — need weight, height, age, sex at minimum
  const weightLbs = profile?.bodyMetrics?.weightLbs;
  const heightInches = profile?.bodyMetrics?.heightInches;
  const dob = profile?.dateOfBirth;
  const sex =
    profile?.biologicalSex === 'male'
      ? 'male'
      : profile?.biologicalSex === 'female'
      ? 'female'
      : undefined;
  const ageYears = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000)) : undefined;
  const canAutoCalc = Boolean(weightLbs && heightInches && ageYears && sex);

  const handleAutoCalc = () => {
    if (!canAutoCalc) {
      Alert.alert(
        'Missing profile info',
        'Add your weight, height, age, and sex in Health Profile to auto-calculate your targets.',
      );
      return;
    }
    const rec = computeMacroRecommendation({
      weightLbs: weightLbs!,
      heightInches: heightInches!,
      ageYears: ageYears!,
      biologicalSex: sex as 'male' | 'female',
      activityLevel: autoActivity,
      goal: autoGoal,
      activePeptides: activeProtocols.map((p) => p.peptideId),
    });
    setCal(String(rec.calories));
    setProtein(String(rec.proteinGrams));
    setCarbs(String(rec.carbsGrams));
    setFat(String(rec.fatGrams));
    setFiber(String(rec.fiberGrams));
    setWater(String(rec.waterOz));
    setAutoRationale(rec.rationale);
  };

  const handleSave = () => {
    // Clamp each field to a sane non-negative range so negative/garbage
    // input can't break the macro-ring math downstream. Mirrors create-food.
    const clamp = (raw: string, fallback: number, max: number) =>
      Math.min(Math.max(parseInt(raw, 10) || fallback, 0), max);
    const newTargets = {
      calories: clamp(cal, 2000, 10000),
      proteinGrams: clamp(protein, 150, 1000),
      carbsGrams: clamp(carbs, 200, 1000),
      fatGrams: clamp(fat, 67, 1000),
      fiberGrams: clamp(fiber, 30, 1000),
      waterOz: clamp(water, 100, 500),
    };
    setTargets(newTargets);
    // Sync to donut chart goals
    setGoalValue('cal', newTargets.calories);
    setGoalValue('pro', newTargets.proteinGrams);
    setGoalValue('carb', newTargets.carbsGrams);
    setGoalValue('fat', newTargets.fatGrams);
    setGoalValue('fiber', newTargets.fiberGrams);
    setGoalValue('water', newTargets.waterOz);
    Alert.alert('Saved', 'Your macro targets have been updated.');
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Macro Targets</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.section}>
          <GlassCard>
            <Field label="Daily Calories" value={cal} onChange={setCal} unit="cal" />
            <Field label="Protein" value={protein} onChange={setProtein} unit="g" />
            <Field label="Carbohydrates" value={carbs} onChange={setCarbs} unit="g" />
            <Field label="Fat" value={fat} onChange={setFat} unit="g" />
            <Field label="Fiber" value={fiber} onChange={setFiber} unit="g" />
            <Field label="Water" value={water} onChange={setWater} unit="oz" />
          </GlassCard>
        </View>

        {/* Auto-calculate from profile */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Auto-calculate</Text>
          <GlassCard>
            <Text style={styles.autoLead}>
              Use your weight, height, age, and goal to compute targets using the Mifflin-St Jeor formula.
            </Text>

            <Text style={styles.autoLabel}>Goal</Text>
            <View style={styles.autoChipRow}>
              {(
                [
                  { k: 'weight_loss', label: 'Fat loss' },
                  { k: 'maintenance', label: 'Maintain' },
                  { k: 'body_recomp', label: 'Recomp' },
                  { k: 'muscle_gain', label: 'Muscle' },
                ] as { k: GoalType; label: string }[]
              ).map(({ k, label }) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setAutoGoal(k)}
                  style={[
                    styles.autoChip,
                    autoGoal === k && styles.autoChipOn,
                  ]}
                >
                  <Text style={[styles.autoChipText, autoGoal === k && styles.autoChipTextOn]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.autoLabel}>Activity</Text>
            <View style={styles.autoChipRow}>
              {(
                [
                  { k: 'sedentary', label: 'Low' },
                  { k: 'light', label: 'Light' },
                  { k: 'moderate', label: 'Moderate' },
                  { k: 'very_active', label: 'High' },
                ] as { k: ActivityLevel; label: string }[]
              ).map(({ k, label }) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setAutoActivity(k)}
                  style={[
                    styles.autoChip,
                    autoActivity === k && styles.autoChipOn,
                  ]}
                >
                  <Text style={[styles.autoChipText, autoActivity === k && styles.autoChipTextOn]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.autoCTA, !canAutoCalc && { opacity: 0.5 }]}
              onPress={handleAutoCalc}
              disabled={!canAutoCalc}
            >
              <Ionicons name="calculator-outline" size={16} color="#fff" />
              <Text style={styles.autoCTAText}>
                {canAutoCalc ? 'Auto-calculate my targets' : 'Complete health profile first'}
              </Text>
            </TouchableOpacity>

            {autoRationale && (
              <View style={styles.rationaleBox}>
                <Text style={styles.rationaleTitle}>How this was calculated</Text>
                {autoRationale.map((line, i) => (
                  <Text key={i} style={styles.rationaleLine}>• {line}</Text>
                ))}
              </View>
            )}
          </GlassCard>
        </View>

        {/* Quick presets */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Presets</Text>
          <View style={styles.presetRow}>
            <TouchableOpacity
              style={styles.preset}
              onPress={() => {
                setCal('1500');
                setProtein('130');
                setCarbs('150');
                setFat('50');
              }}
            >
              <Text style={styles.presetTitle}>Fat Loss</Text>
              <Text style={styles.presetDesc}>1500 cal · High protein</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.preset}
              onPress={() => {
                setCal('2000');
                setProtein('150');
                setCarbs('200');
                setFat('67');
              }}
            >
              <Text style={styles.presetTitle}>Maintenance</Text>
              <Text style={styles.presetDesc}>2000 cal · Balanced</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.preset}
              onPress={() => {
                setCal('2500');
                setProtein('180');
                setCarbs('280');
                setFat('78');
              }}
            >
              <Text style={styles.presetTitle}>Muscle Gain</Text>
              <Text style={styles.presetDesc}>2500 cal · Surplus</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <GradientButton label="Save Targets" onPress={handleSave} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInput}>
        <TextInput
          style={styles.fieldText}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
        />
        <Text style={styles.fieldUnit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
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
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: Colors.darkText,
  },
  scroll: { paddingBottom: 40 },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.darkText,
    marginBottom: Spacing.sm,
  },

  // Field
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  fieldLabel: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    color: Colors.darkText,
  },
  fieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fieldText: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 38,
    width: 80,
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.almostAquaDeep,
    textAlign: 'center',
  },
  fieldUnit: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    width: 24,
  },

  // Presets
  presetRow: {
    flexDirection: 'row',
    gap: 10,
  },
  preset: {
    flex: 1,
    backgroundColor: Colors.glassBlue,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.glassBlueBorder,
    padding: 12,
    alignItems: 'center',
  },
  presetTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    color: Colors.darkText,
  },
  presetDesc: {
    fontSize: 10,
    color: Colors.darkTextSecondary,
    marginTop: 3,
    textAlign: 'center',
  },

  // Auto-calc
  autoLead: {
    fontSize: FontSizes.sm,
    color: Colors.darkTextSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  autoLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.darkTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 8,
  },
  autoChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  autoChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  autoChipOn: {
    backgroundColor: Colors.almostAquaDeep,
    borderColor: Colors.almostAquaDeep,
  },
  autoChipText: {
    fontSize: FontSizes.xs,
    color: Colors.darkText,
    fontWeight: '600',
  },
  autoChipTextOn: {
    color: '#fff',
  },
  autoCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.almostAquaDeep,
    marginTop: 12,
  },
  autoCTAText: {
    color: '#fff',
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  rationaleBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(127,179,194,0.08)',
  },
  rationaleTitle: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: Colors.darkTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  rationaleLine: {
    fontSize: FontSizes.xs,
    color: Colors.darkText,
    lineHeight: 16,
    marginBottom: 2,
  },
});
