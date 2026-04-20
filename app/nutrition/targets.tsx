/**
 * Macro Targets settings screen.
 */

import React, { useState } from 'react';
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

export default function MacroTargetsScreen() {
  const router = useRouter();
  const { targets, setTargets } = useMealStore();
  const setGoalValue = useProgressGoalsStore((s) => s.setGoalValue);
  const [cal, setCal] = useState(String(targets.calories));
  const [protein, setProtein] = useState(String(targets.proteinGrams));
  const [carbs, setCarbs] = useState(String(targets.carbsGrams));
  const [fat, setFat] = useState(String(targets.fatGrams));
  const [fiber, setFiber] = useState(String(targets.fiberGrams ?? 30));
  const [water, setWater] = useState(String(targets.waterOz ?? 100));

  const handleSave = () => {
    const newTargets = {
      calories: parseInt(cal, 10) || 2000,
      proteinGrams: parseInt(protein, 10) || 150,
      carbsGrams: parseInt(carbs, 10) || 200,
      fatGrams: parseInt(fat, 10) || 67,
      fiberGrams: parseInt(fiber, 10) || 30,
      waterOz: parseInt(water, 10) || 100,
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
});
